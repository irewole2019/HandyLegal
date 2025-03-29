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

// Serve chat.html for the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'chat.html'));
});

// Function to read PDF content
async function readPDFContent(filePath) {
    try {
        console.log('Reading PDF file:', filePath);
        const dataBuffer = fs.readFileSync(filePath);
        console.log('PDF file read, size:', dataBuffer.length);
        
        const data = await pdfParse(dataBuffer);
        console.log('PDF parsed successfully, text length:', data.text.length);
        
        if (!data.text || data.text.trim().length === 0) {
            console.error('No text content extracted from PDF');
            return null;
        }
        
        return data.text;
    } catch (error) {
        console.error('Error reading PDF:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            path: filePath
        });
        return null;
    }
}

// Initialize legal documents
let legalDocuments = [];

// Load PDF documents on server start
async function loadLegalDocuments() {
    try {
        // Use path.join and handle special characters in filename
        const pdfPath = path.join(__dirname, "CHILD'S RIGHT ACT.pdf");
        console.log('Attempting to read PDF from:', pdfPath);
        
        // Check if file exists
        if (!fs.existsSync(pdfPath)) {
            console.error('PDF file not found at:', pdfPath);
            // Try alternative path without special characters
            const altPath = path.join(__dirname, "CHILDS_RIGHT_ACT.pdf");
            if (fs.existsSync(altPath)) {
                console.log('Found PDF at alternative path:', altPath);
                const content = await readPDFContent(altPath);
                if (content) {
                    legalDocuments = [
                        {
                            title: "Child's Rights Act",
                            content: content
                        }
                    ];
                    console.log('Legal documents loaded successfully from alternative path');
                    return;
                }
            }
            // If both paths fail, use fallback content
            console.log('Using fallback content for legal documents');
            legalDocuments = [
                {
                    title: "Child's Rights Act",
                    content: `The Child's Rights Act (CRA) is a Nigerian law that was passed in 2003 to protect the rights of children. Key provisions include:

1. Right to Survival and Development
- Every child has the right to life, survival, and development
- Access to basic healthcare, nutrition, and education

2. Right to Protection
- Protection from abuse, neglect, and exploitation
- Protection from harmful traditional practices
- Protection from child labor

3. Right to Participation
- Right to express views and be heard
- Right to participate in decisions affecting them

4. Right to Education
- Free and compulsory basic education
- Access to quality education

5. Rights of Children with Disabilities
- Special protection and care
- Access to education and healthcare

6. Rights of Children in Conflict with the Law
- Protection from torture and cruel treatment
- Right to legal representation
- Right to fair hearing

The Act also establishes the responsibilities of parents, government, and society in ensuring these rights are protected.`
                }
            ];
            return;
        }
        
        const content = await readPDFContent(pdfPath);
        
        if (!content) {
            console.error('No content extracted from PDF, using fallback content');
            legalDocuments = [
                {
                    title: "Child's Rights Act",
                    content: `The Child's Rights Act (CRA) is a Nigerian law that was passed in 2003 to protect the rights of children. Key provisions include:

1. Right to Survival and Development
- Every child has the right to life, survival, and development
- Access to basic healthcare, nutrition, and education

2. Right to Protection
- Protection from abuse, neglect, and exploitation
- Protection from harmful traditional practices
- Protection from child labor

3. Right to Participation
- Right to express views and be heard
- Right to participate in decisions affecting them

4. Right to Education
- Free and compulsory basic education
- Access to quality education

5. Rights of Children with Disabilities
- Special protection and care
- Access to education and healthcare

6. Rights of Children in Conflict with the Law
- Protection from torture and cruel treatment
- Right to legal representation
- Right to fair hearing

The Act also establishes the responsibilities of parents, government, and society in ensuring these rights are protected.`
                }
            ];
            return;
        }
        
        legalDocuments = [
            {
                title: "Child's Rights Act",
                content: content
            }
        ];
        
        console.log('Legal documents loaded successfully');
        console.log('Document content length:', content.length);
    } catch (error) {
        console.error('Error loading legal documents:', error);
        // Add fallback content in case of error
        legalDocuments = [
            {
                title: "Child's Rights Act",
                content: `The Child's Rights Act (CRA) is a Nigerian law that was passed in 2003 to protect the rights of children. Key provisions include:

1. Right to Survival and Development
- Every child has the right to life, survival, and development
- Access to basic healthcare, nutrition, and education

2. Right to Protection
- Protection from abuse, neglect, and exploitation
- Protection from harmful traditional practices
- Protection from child labor

3. Right to Participation
- Right to express views and be heard
- Right to participate in decisions affecting them

4. Right to Education
- Free and compulsory basic education
- Access to quality education

5. Rights of Children with Disabilities
- Special protection and care
- Access to education and healthcare

6. Rights of Children in Conflict with the Law
- Protection from torture and cruel treatment
- Right to legal representation
- Right to fair hearing

The Act also establishes the responsibilities of parents, government, and society in ensuring these rights are protected.`
            }
        ];
    }
}

// Load documents when server starts
loadLegalDocuments();

// Function to perform RAG
async function performRAG(query) {
    try {
        // 1. Convert documents to embeddings
        const documentEmbeddings = await Promise.all(
            legalDocuments.map(async (doc) => {
                const response = await openai.embeddings.create({
                    model: "text-embedding-ada-002",
                    input: doc.content
                });
                return {
                    ...doc,
                    embedding: response.data[0].embedding
                };
            })
        );

        // 2. Get query embedding
        const queryEmbedding = await openai.embeddings.create({
            model: "text-embedding-ada-002",
            input: query
        });

        // 3. Calculate similarity scores
        const similarityScores = documentEmbeddings.map(doc => ({
            ...doc,
            score: cosineSimilarity(queryEmbedding.data[0].embedding, doc.embedding)
        }));

        // 4. Sort by similarity and get top 3 most relevant documents
        const relevantDocs = similarityScores
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);

        // 5. Generate response using GPT-4
        const prompt = `Based on the following legal documents, please answer the question: "${query}"\n\nRelevant documents:\n${relevantDocs.map(doc => `Title: ${doc.title}\nContent: ${doc.content}`).join('\n\n')}\n\nPlease provide a clear and accurate response based on these documents.`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                {
                    role: "system",
                    content: "You are a legal assistant specializing in Nigerian law. Provide accurate, clear, and helpful responses based on the provided legal documents."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
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