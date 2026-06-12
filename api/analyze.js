import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/generative-ai';
import { Groq } from 'groq-sdk';

// Initialize Supabase Connection using Vercel Environment Variables
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

export default async function handler(req, res) {
    // CORS headers handle karne ke liye taaki frontend se fetch fail na ho
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { email, token, textInput, imageBase64, currentTool } = req.body;

    try {
        // 1. Supabase se active keys uthana
        const { data: keys, error: keyError } = await supabase
            .from('api_keys')
            .select('*')
            .eq('status', 'active');

        if (keyError || !keys || keys.length === 0) {
            return res.status(500).json({ error: "Bhai, database me koi active key nahi mili!" });
        }

        const geminiKeys = keys.filter(k => k.provider === 'gemini');
        const groqKeys = keys.filter(k => k.provider === 'groq');

        // 2. Routing Logic: Image vs Text Tools
        if (imageBase64 || currentTool === 'thumb_audit' || currentTool === 'pitch') {
            if (geminiKeys.length === 0) throw new Error("No Gemini keys found in Supabase.");
            
            // Loop sirf keys rotate karega, model KHALI gemini-2.0-flash rahega
            for (let i = 0; i < geminiKeys.length; i++) {
                try {
                    const aiStudio = new GoogleGenAI({ apiKey: geminiKeys[i].api_key });
                    const model = aiStudio.getGenerativeModel({ model: "gemini-2.0-flash" });
                    
                    const prompt = `Act as an expert content auditor for tool: ${currentTool}. Context: ${textInput}`;
                    const imageParts = [{ inlineData: { data: imageBase64, mimeType: "image/jpeg" } }];

                    const result = await model.generateContent([prompt, ...imageParts]);
                    return res.status(200).json({ response: result.response.text() });
                } catch (err) {
                    console.log(`Gemini Key index ${i} failed, trying next...`);
                    if (i === geminiKeys.length - 1) throw err;
                }
            }

        } else {
            if (groqKeys.length === 0) throw new Error("No Groq keys found in Supabase.");

            // Loop sirf keys rotate karega, model KHALI llama-3.3-70b-versatile rahega
            for (let i = 0; i < groqKeys.length; i++) {
                try {
                    const groq = new Groq({ apiKey: groqKeys[i].api_key });
                    const chatCompletion = await groq.chat.completions.create({
                        messages: [{ role: 'user', content: `Act as a Viral Creator Engine for tool: ${currentTool}. Context: ${textInput}` }],
                        model: 'llama-3.3-70b-versatile',
                    });
                    return res.status(200).json({ response: chatCompletion.choices[0].message.content });
                } catch (err) {
                    console.log(`Groq Key index ${i} failed, trying next...`);
                    if (i === groqKeys.length - 1) throw err;
                }
            }
        }

    } catch (globalError) {
        return res.status(500).json({ error: "Bhai backend core me lafda hua h: " + globalError.message });
    }
}
