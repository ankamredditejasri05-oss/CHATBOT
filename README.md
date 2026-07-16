
# AI Chatbot

## Description
This project is an AI-powered chatbot that provides intelligent and interactive conversations using the Google Gemini API. It is designed with a clean and user-friendly interface, allowing users to ask questions and receive real-time AI-generated responses.

The chatbot maintains conversation history during a session, supports multiple chats, and delivers fast, context-aware responses. The project is built using HTML, CSS, JavaScript, and Python, with Flask handling the backend and API communication.

## Features
- 🤖 AI-powered conversational chatbot
- 💬 Real-time responses
- 📝 Conversation history
- ➕ Create new chats
- 🗑️ Delete chat history
- 🎨 Clean and responsive user interface
- ⚡ Fast and interactive experience
- 🔒 Secure API key management using `.env`

## Technologies Used
- HTML5
- CSS3
- JavaScript
- Python
- Flask
- Google Gemini API

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/AI-Chatbot.git
   ```

2. Navigate to the project folder:
   ```bash
   cd AI-Chatbot
   ```

3. Install the required packages:
   ```bash
   pip install -r requirements.txt
   ```

4. Create a `.env` file and add your API key:
   ```env
   GEMINI_API_KEY=your_api_key_here
   ```

5. Run the application:
   ```bash
   python app.py
   ```

6. Open your browser and visit:
   ```
   http://127.0.0.1:5000
   ```

## Project Structure

```
AI-Chatbot/
│── app.py
│── storage.py
│── requirements.txt
│── README.md
│── .gitignore
│── .env
│── static/
│   ├── style.css
│   └── app.js
│── templates/
│   └── index.html
│── data/
│   └── conversations.json
```

## Future Enhancements
- User authentication
- Voice input and output
- File upload support
- Dark/Light theme
- Export chat history
- Multi-language support

## License
This project is developed for learning and educational purposes.
