import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/generative-ai';
import { Groq } from 'groq-sdk';

// Env variables setup (Vercel Dashboard se configure honge baad me)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
    // OPTIONS request check (CORS configuration)
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: "Method not allowed, use POST" });
    }

    const { toolMode, textPrompt, imageBase64 } = req.body;

    try {
        // 1. ToolMode ke hisab se provider select karein
        const isImageTool = (toolMode === 'pitch' || toolMode === 'thumbnail_audit');
        const requiredProvider = isImageTool ? 'gemini' : 'groq';

        // 2. Supabase se active keys rotation algorithm chalayein
        const { data: keys, error } = await supabase
            .from('api_keys')
            .select('*')
            .eq('provider', requiredProvider)
            .eq('status', 'active')
            .order('id', { ascending: true });

        if (error || !keys || keys.length === 0) {
            throw new Error(`Bhai database mein ${requiredProvider} ki koi active key nahi mili!`);
        }

        let aiResponse = "";
        let success = false;

        // 3. Fallback Rotation Loop (8+ Keys bulletproof system)
        for (let keyObj of keys) {
            try {
                if (requiredProvider === 'groq') {
                    // --- GROQ EXECUTION ---
                    const groq = new Groq({ apiKey: keyObj.api_key });
                    
                    const systemPrompt = `You are the core intelligence of Orion AI Hub. You are an expert product manager, growth marketer, copywriter, and script doctor. Provide short, punchy, actionable advice with no fluff.`;

                    const completion = await groq.chat.completions.create({
                        messages: [
                            { role: "system", content: systemPrompt },
                            { role: "user", content: `Tool Name: ${toolMode}. Context: ${textPrompt}` }
                        ],
                        model: "llama3-8b-8192",
                    });
                    aiResponse = completion.choices[0].message.content;
                } else {
                    // --- GEMINI EXECUTION ---
                    const ai = new GoogleGenAI({ apiKey: keyObj.api_key });
                    const model = ai.getGenerativeModel({ model: "gemini-2.0-flash" });

                    let promptParts = [`Tool Name: ${toolMode}. Analysis prompt: ${textPrompt}`];
                    
                    if (imageBase64) {
                        const imagePart = {
                            inlineData: {
                                data: imageBase64.split(",")[1] || imageBase64,
                                mimeType: "image/jpeg"
                            },
                        };
                        promptParts.push(imagePart);
                    }

                    const result = await model.generateContent(promptParts);
                    const response = await result.response;
                    aiResponse = response.text();
                }

                success = true;
                break; // Agar call kamyab raha, loop ko break karo

            } catch (apiError) {
                console.error(`Key ID ${keyObj.id} fail ho gayi, status 429 triggered. Trying fallback backup key...`);
                // Base automation: Fail key ko database mein auto 'expired' update kar sakte hain yahan
                await supabase.from('api_keys').update({ status: 'expired' }).eq('id', keyObj.id);
            }
        }

        if (!success) {
            return res.status(500).json({ error: "Bhai saari keys exhaust ho gayi hain! Admin se bolo keys refresh kare." });
        }

        return res.status(200).json({ result: aiResponse });

    } catch (globalError) {
        return res.status(500).json({ error: globalError.message });
    }
              }
                      
