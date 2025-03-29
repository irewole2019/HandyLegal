# HandyLegal Chat Interface

A modern chat interface for querying Nigerian legal documents using OpenAI's RAG (Retrieval-Augmented Generation) API.

## Features

- Clean and modern chat interface
- Real-time responses based on legal documents
- Powered by OpenAI's GPT-4 and embeddings
- RAG implementation for accurate legal information retrieval

## Prerequisites

- Node.js (v14 or higher)
- OpenAI API key
- npm or yarn package manager

## Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd handylegal-landing
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory and add your OpenAI API key:
```
OPENAI_API_KEY=your_openai_api_key_here
PORT=3000
```

4. Add your legal documents to the `legalDocuments` array in `server.js`

## Running the Application

1. Start the development server:
```bash
npm run dev
```

2. Open your browser and navigate to:
```
http://localhost:3000
```

## Usage

1. Click the "Start Now" button on the landing page to access the chat interface
2. Type your legal question in the input field
3. Press Enter or click the send button to get a response
4. The system will search through the legal documents and provide relevant information

## Customization

- Add more legal documents by updating the `legalDocuments` array in `server.js`
- Modify the chat interface styling in `chat.html`
- Adjust the RAG parameters in `server.js` (e.g., number of relevant documents, temperature)

## Security Notes

- Never commit your `.env` file or expose your OpenAI API key
- Consider implementing rate limiting and user authentication for production use

## License

MIT License 