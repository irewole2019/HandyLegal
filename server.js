require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');

const app = express();
const port = process.env.PORT || 3000;

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Middleware
app.use(cors({
    origin: '*', // Allow requests from any origin
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Fallback content for when PDF is not available
const fallbackContent = `The Child's Rights Act (CRA) 2003 is a Nigerian law that was passed to domesticate the Convention on the Rights of the Child. The Act provides for the rights and responsibilities of children in Nigeria.

Key provisions include:
1. Right to survival and development
2. Right to name and nationality
3. Right to education
4. Right to healthcare
5. Protection from harmful practices
6. Protection from exploitation and abuse

The Act applies to all children under 18 years of age in Nigeria.`;

// Function to read PDF content
async function readPDFContent(filePath) {
    try {
        console.log(`Attempting to read PDF from: ${filePath}`);
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(dataBuffer);
        return data.text;
    } catch (error) {
        console.log(`PDF file not found at: ${filePath}`);
        return fallbackContent;
    }
}

// Function to load legal documents
async function loadLegalDocuments() {
    try {
        const pdfPath = path.join(__dirname, "CHILD'S RIGHT ACT.pdf");
        const content = await readPDFContent(pdfPath);
        return [content];
    } catch (error) {
        console.error('Error loading legal documents:', error);
        return [fallbackContent];
    }
}

// Initialize legal documents
let legalDocuments = [];
loadLegalDocuments().then(docs => {
    legalDocuments = docs;
    console.log('Legal documents loaded successfully');
}).catch(error => {
    console.error('Error initializing legal documents:', error);
    legalDocuments = [fallbackContent];
});

// Function to perform RAG
async function performRAG(query) {
    try {
        // Create embeddings for the query
        const queryEmbedding = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: query
        });

        // Create embeddings for legal documents
        const documentEmbeddings = await Promise.all(
            legalDocuments.map(async (doc) => {
                const embedding = await openai.embeddings.create({
                    model: "text-embedding-3-small",
                    input: doc
                });
                return {
                    content: doc,
                    embedding: embedding.data[0].embedding
                };
            })
        );

        // Calculate cosine similarity
        const similarities = documentEmbeddings.map((doc) => {
            const similarity = cosineSimilarity(
                queryEmbedding.data[0].embedding,
                doc.embedding
            );
            return { content: doc.content, similarity };
        });

        // Sort by similarity and get top 3 most relevant documents
        similarities.sort((a, b) => b.similarity - a.similarity);
        const relevantDocs = similarities.slice(0, 3).map(doc => doc.content);

        // Create the prompt for GPT-4
        const prompt = `You are a legal assistant specializing in Nigerian Child's Rights Act. 
        Based on the following legal documents, please answer the question: "${query}"
        
        Relevant legal documents:
        ${relevantDocs.join('\n\n')}
        
        Please provide a clear, concise, and accurate response based on the legal documents provided.`;

        // Get response from GPT-4
        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo-preview",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
            max_tokens: 500
        });

        return completion.choices[0].message.content;
    } catch (error) {
        console.error('Error in RAG:', error);
        throw error;
    }
}

// Helper function to calculate cosine similarity
function cosineSimilarity(vecA, vecB) {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const normA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const normB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    return dotProduct / (normA * normB);
}

// API endpoint for chat
app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }
        const response = await performRAG(message);
        res.json({ response });
    } catch (error) {
        console.error('Error processing chat request:', error);
        res.status(500).json({ 
            error: 'Failed to process request',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        error: 'Something went wrong!',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// For Vercel deployment
module.exports = app; 