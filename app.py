


import json
import os
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request, send_from_directory
from flask_cors import CORS
from google import genai
from google.genai import types

import storage

# ── Environment ───────────────────────────────────────────────────────────────
load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "ENTER YOUR API KEY")
PORT = int(os.getenv("PORT", 3000))

# ── App ───────────────────────────────────────────────────────────────────────
PUBLIC_DIR = Path(__file__).parent / "public"

# IMPORTANT: static_folder and static_url_path must NOT interfere with /api/*.
# We disable Flask's built-in static handling (static_folder=None) and serve
# all frontend files manually so we have full control over routing order.
app = Flask(__name__, static_folder=None)
CORS(app)


# ─────────────────────────────────────────────────────────────────────────────
# PERSONA SYSTEM INSTRUCTIONS
# ─────────────────────────────────────────────────────────────────────────────
PERSONAS: dict[str, str] = {
    "default": (
        "You are a helpful, friendly, and knowledgeable AI assistant. "
        "Provide clear, concise, and accurate responses. "
        "Format code with markdown code blocks when appropriate."
    ),
    "coding": (
        "You are an expert software engineer and coding assistant. "
        "Always provide well-commented code examples, explain your reasoning, "
        "and suggest best practices. Use markdown code blocks with language tags."
    ),
    "teacher": (
        "You are a patient and encouraging teacher. "
        "Break down complex topics into simple, easy-to-understand concepts. "
        "Use analogies, examples, and ask check-in questions to ensure understanding."
    ),
    "creative": (
        "You are a creative writing partner with a vivid imagination. "
        "Help with storytelling, brainstorming, poetry, and creative projects. "
        "Be expressive, imaginative, and inspiring in your responses."
    ),
    "analyst": (
        "You are a sharp analytical assistant specialising in data, research, "
        "and critical thinking. Provide structured, evidence-based analysis. "
        "Use bullet points and structured formats when helpful."
    ),
}


def get_persona_instruction(persona: str) -> str:
    return PERSONAS.get(persona, PERSONAS["default"])


def get_gemini_client() -> genai.Client:
    if not GEMINI_API_KEY or GEMINI_API_KEY == "your_gemini_api_key_here":
        raise ValueError(
            "Gemini API key not configured. Set GEMINI_API_KEY in .env"
        )
    return genai.Client(api_key=GEMINI_API_KEY)


# ─────────────────────────────────────────────────────────────────────────────
# API ROUTES  (must be declared before the catch-all static route)
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/config", methods=["GET"])
def get_config():
    key_ok = bool(GEMINI_API_KEY and GEMINI_API_KEY != "your_gemini_api_key_here")
    masked = "Not Configured"
    if key_ok:
        masked = f"{GEMINI_API_KEY[:8]}...{GEMINI_API_KEY[-8:]}" if len(GEMINI_API_KEY) > 16 else "Active"
    return jsonify({
        "success": True,
        "keyConfigured": key_ok,
        "keyMasked": masked
    })


@app.route("/api/conversations", methods=["GET"])
def list_conversations():
    try:
        return jsonify({"success": True, "conversations": storage.get_all_conversations()})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/conversations/<conv_id>", methods=["GET"])
def get_conversation(conv_id: str):
    try:
        conv = storage.get_conversation(conv_id)
        if conv is None:
            return jsonify({"success": False, "error": "Conversation not found."}), 404
        return jsonify({"success": True, "conversation": conv})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/conversations", methods=["POST"])
def create_conversation():
    try:
        body = request.get_json(silent=True) or {}
        conv = storage.create_conversation(
            body.get("title", "New Conversation"),
            body.get("persona", "default"),
        )
        return jsonify({"success": True, "conversation": conv}), 201
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/conversations/<conv_id>", methods=["DELETE"])
def delete_conversation(conv_id: str):
    try:
        if not storage.delete_conversation(conv_id):
            return jsonify({"success": False, "error": "Conversation not found."}), 404
        return jsonify({"success": True, "message": "Conversation deleted."})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/conversations/<conv_id>/title", methods=["PATCH"])
def rename_conversation(conv_id: str):
    try:
        body  = request.get_json(silent=True) or {}
        title = body.get("title", "").strip()
        if not title:
            return jsonify({"success": False, "error": "Title cannot be empty."}), 400
        if not storage.update_title(conv_id, title):
            return jsonify({"success": False, "error": "Conversation not found."}), 404
        return jsonify({"success": True, "message": "Title updated."})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/conversations/<conv_id>/messages", methods=["POST"])
def send_message(conv_id: str):
    """
    Receive a user message and stream Gemini's reply via SSE.
    The entire conversation history is forwarded for context retention.
    """
    if not GEMINI_API_KEY or GEMINI_API_KEY == "your_gemini_api_key_here":
        return jsonify({
            "success": False,
            "error": "Gemini API key not configured. Set GEMINI_API_KEY in .env",
        }), 500

    body    = request.get_json(silent=True) or {}
    message = body.get("message", "").strip()
    if not message:
        return jsonify({"success": False, "error": "Message cannot be empty."}), 400

    conv = storage.get_conversation(conv_id)
    if conv is None:
        return jsonify({"success": False, "error": "Conversation not found."}), 404

    # Persist user message before calling the API
    storage.add_message(conv_id, "user", message)

    # Build multi-turn history for Gemini
    gemini_history = [
        types.Content(
            role="user" if m["role"] == "user" else "model",
            parts=[types.Part(text=m["content"])],
        )
        for m in conv.get("messages", [])
    ]

    system_instruction = get_persona_instruction(conv.get("persona", "default"))

    def generate_sse():
        full_response = ""
        try:
            client = get_gemini_client()
            stream = client.models.generate_content_stream(
                model="gemini-2.5-flash",
                contents=gemini_history + [
                    types.Content(role="user", parts=[types.Part(text=message)])
                ],
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    temperature=0.7,
                ),
            )
            for chunk in stream:
                if chunk.text:
                    full_response += chunk.text
                    yield f"data: {json.dumps({'chunk': chunk.text})}\n\n"

            storage.add_message(conv_id, "model", full_response)
            yield f"data: {json.dumps({'done': True})}\n\n"

        except Exception as exc:
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"

    return Response(
        generate_sse(),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.route("/api/search", methods=["GET"])
def search():
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify({"success": False, "error": "Search query is required."}), 400
    try:
        results = storage.search_conversations(query)
        return jsonify({"success": True, "results": results, "query": query})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ─────────────────────────────────────────────────────────────────────────────
# STATIC FILE SERVING  (declared AFTER all /api/* routes)
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/")
def serve_index():
    return send_from_directory(str(PUBLIC_DIR), "index.html")


@app.route("/<path:filename>")
def serve_static(filename: str):
    """
    Serve any file from /public.
    Flask resolves exact /api/<...> routes before this catch-all,
    so API endpoints are never blocked by this handler.
    """
    target = PUBLIC_DIR / filename
    if target.exists() and target.is_file():
        return send_from_directory(str(PUBLIC_DIR), filename)
    # SPA fallback
    return send_from_directory(str(PUBLIC_DIR), "index.html")


# ─────────────────────────────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    key_ok = bool(GEMINI_API_KEY and GEMINI_API_KEY != "your_gemini_api_key_here")
    print(f"\nGeminiChat (Python/Flask) running at http://localhost:{PORT}")
    print(f"Chat history : {storage.DB_FILE}")
    print(f"Gemini API   : {'Configured' if key_ok else 'NOT SET - check .env'}\n")
    app.run(host="0.0.0.0", port=PORT, debug=True)
