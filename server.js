require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const path = require('path');
const https = require('https');
const pdfParse = require('pdf-parse');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3000;

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    dangerouslyAllowBrowser: true
});

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || 'https://lnqhdclsrralhuogdgtn.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Server-side service key should be kept private
let supabase = null;

// Only initialize Supabase if the key is available
if (supabaseKey) {
    try {
        supabase = createClient(supabaseUrl, supabaseKey);
        console.log('Supabase client initialized successfully');
    } catch (error) {
        console.error('Error initializing Supabase client:', error);
    }
} else {
    console.warn('SUPABASE_SERVICE_KEY is not set. Authentication features will be disabled.');
}

// GitHub raw PDF URL - we'll update this once you push the PDF to GitHub
const PDF_URL = 'https://raw.githubusercontent.com/irewole2019/HandyLegal/main/childs_right_act.pdf';

// Middleware
app.use(cors({
    origin: '*', // Allow requests from any origin
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'] // Make sure Authorization header is allowed
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

// Function to fetch PDF content from GitHub
async function fetchPDFContent() {
    try {
        console.log('Fetching PDF from GitHub...');
        return new Promise((resolve, reject) => {
            https.get(PDF_URL, (response) => {
                if (response.statusCode !== 200) {
                    console.error(`Failed to fetch PDF: ${response.statusCode}`);
                    return resolve(fallbackContent);
                }

                const chunks = [];
                response.on('data', (chunk) => chunks.push(chunk));
                response.on('end', async () => {
                    try {
                        const buffer = Buffer.concat(chunks);
                        const data = await pdfParse(buffer);
                        console.log('PDF fetched and parsed successfully');
                        resolve(data.text);
                    } catch (error) {
                        console.error('Error parsing PDF:', error);
                        resolve(fallbackContent);
                    }
                });
            }).on('error', (error) => {
                console.error('Error fetching PDF:', error);
                resolve(fallbackContent);
            });
        });
    } catch (error) {
        console.error('Error in fetchPDFContent:', error);
        return fallbackContent;
    }
}

// Function to chunk text into smaller pieces
function chunkText(text, maxChunkSize = 8000) {
    const paragraphs = text.split(/\n\s*\n/);
    const chunks = [];
    let currentChunk = '';

    for (const paragraph of paragraphs) {
        if ((currentChunk + paragraph).length > maxChunkSize) {
            if (currentChunk) {
                chunks.push(currentChunk.trim());
            }
            currentChunk = paragraph;
        } else {
            currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
        }
    }
    if (currentChunk) {
        chunks.push(currentChunk.trim());
    }
    return chunks;
}

// Function to load legal documents
async function loadLegalDocuments() {
    try {
        const content = await fetchPDFContent();
        // Split content into chunks
        const chunks = chunkText(content);
        console.log(`Split content into ${chunks.length} chunks`);
        return chunks;
    } catch (error) {
        console.error('Error loading legal documents:', error);
        return [fallbackContent];
    }
}

// Initialize legal documents and their embeddings
let legalDocuments = [];
let documentEmbeddings = [];

// Function to create embeddings for documents
async function createDocumentEmbeddings(documents) {
    return await Promise.all(
        documents.map(async (doc) => {
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
}

// Initialize legal documents and create embeddings
loadLegalDocuments().then(async docs => {
    try {
        legalDocuments = docs;
        console.log('Legal documents loaded successfully');
        
        // Create embeddings for all documents
        try {
            documentEmbeddings = await createDocumentEmbeddings(docs);
            console.log('Document embeddings created successfully');
        } catch (embeddingError) {
            console.error('Error creating document embeddings:', embeddingError);
            // Create fallback embeddings for simple matching
            documentEmbeddings = docs.map(doc => ({
                content: doc,
                embedding: Array(1536).fill(0) // Default embedding size
            }));
            console.log('Using fallback embeddings due to error');
        }
    } catch (error) {
        console.error('Error in document loading process:', error);
        legalDocuments = [fallbackContent];
        // Create fallback embedding
        documentEmbeddings = [{
            content: fallbackContent,
            embedding: Array(1536).fill(0)
        }];
    }
}).catch(error => {
    console.error('Error initializing legal documents:', error);
    legalDocuments = [fallbackContent];
    // Create fallback embedding
    documentEmbeddings = [{
        content: fallbackContent,
        embedding: Array(1536).fill(0)
    }];
});

// Function to perform RAG
async function performRAG(query) {
    try {
        console.log('Starting RAG process for query:', query);
        
        // Check if OpenAI API key is available
        if (!process.env.OPENAI_API_KEY) {
            console.error('OPENAI_API_KEY is not set. Cannot perform RAG without it.');
            throw new Error('OpenAI API key is not configured');
        }
        
        // Check if document embeddings are ready
        if (!documentEmbeddings || documentEmbeddings.length === 0) {
            console.error('Document embeddings are not ready yet. Using fallback content.');
            return `I'm still loading the legal documents. Please try again in a moment.\n\n---\n\n**Disclaimer:** This information is AI-generated and may not be accurate or complete. We are not lawyers, and this should not be considered legal advice. For accurate legal guidance, please consult with a qualified legal professional.`;
        }
        
        console.log('Creating query embedding...');
        // Create embedding for the query
        const queryEmbedding = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: query
        });
        console.log('Query embedding created successfully');

        // Calculate cosine similarity using cached embeddings
        console.log('Calculating similarities with', documentEmbeddings.length, 'documents');
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
        console.log('Found', relevantDocs.length, 'relevant documents');

        // Create the prompt for GPT-4 with formatting instructions
        console.log('Creating prompt for OpenAI...');
        const prompt = `You are a legal assistant specializing in Nigerian Child's Rights Act. 
        Based on the following legal documents, please answer the question: "${query}"
        
        Relevant legal documents:
        ${relevantDocs.join('\n\n')}
        
        Please provide a clear, concise, and accurate response based on the legal documents provided.
        Format your response as follows:
        
        1. Start with a brief, direct answer to the question
        2. Then provide relevant details in bullet points or numbered lists
        3. For EVERY point or detail, you MUST include the specific section number(s) from the Child's Rights Act that support it
        4. Format section references as "Section X" or "Sections X and Y" where X and Y are the section numbers
        5. Use clear headings and sections to organize the information
        6. End with any important notes or warnings if relevant
        
        Keep the response concise but comprehensive. Use proper spacing and formatting to make it easy to read.
        Remember: Every piece of information must be backed by specific section references from the Act.`;

        // Get response from GPT-4
        console.log('Sending request to OpenAI...');
        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo-preview",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
            max_tokens: 500
        });
        console.log('Received response from OpenAI');

        // Add disclaimer to the response
        const response = completion.choices[0].message.content;
        const disclaimer = "\n\n---\n\n**Disclaimer:** This information is AI-generated and may not be accurate or complete. We are not lawyers, and this should not be considered legal advice. For accurate legal guidance, please consult with a qualified legal professional.";
        
        console.log('RAG process completed successfully');
        return response + disclaimer;
    } catch (error) {
        console.error('Error in RAG process:', error);
        console.error('Error details:', error.message);
        if (error.response) {
            console.error('OpenAI API Error response:', error.response.data);
            console.error('OpenAI API Error status:', error.response.status);
        }
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

        // Check if OpenAI API key is available
        if (!process.env.OPENAI_API_KEY) {
            console.error('OpenAI API key is not set');
            return res.status(500).json({ 
                error: 'OpenAI API key is not configured',
                details: 'Please check your environment variables'
            });
        }

        // Check for authentication token in headers
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ') && supabase) {
            const token = authHeader.substring(7, authHeader.length);
            try {
                // Verify the token with Supabase
                const { data, error } = await supabase.auth.getUser(token);
                
                if (error) {
                    console.error('Authentication error:', error.message);
                    // Continue anyway for now, to avoid blocking chat functionality
                    console.log('Proceeding with request despite authentication error');
                } else if (data && data.user) {
                    console.log('Authenticated user:', data.user.email);
                }
            } catch (authError) {
                console.error('Error verifying token:', authError);
                // Continue anyway for now, to avoid blocking chat functionality
                console.log('Proceeding with request despite authentication error');
            }
        } else {
            console.log('No authentication token provided or Supabase not initialized, proceeding as anonymous');
        }

        console.log('Processing chat request with message:', message);
        
        try {
            const response = await performRAG(message);
            console.log('Chat request processed successfully');
            return res.json({ response });
        } catch (ragError) {
            console.error('Error in performRAG function:', ragError);
            return res.status(500).json({ 
                error: 'RAG processing error',
                message: ragError.message,
                details: process.env.NODE_ENV === 'development' ? ragError.stack : undefined
            });
        }
    } catch (error) {
        console.error('Error processing chat request:', error);
        // Check if it's an OpenAI API error
        if (error.response) {
            console.error('OpenAI API Error:', error.response.data);
            return res.status(500).json({ 
                error: 'OpenAI API Error',
                details: error.response.data.error?.message || 'Unknown API error'
            });
        }
        res.status(500).json({ 
            error: 'Failed to process request',
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
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

// Start the server if not in Vercel environment
if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}