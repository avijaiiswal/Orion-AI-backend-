import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/generative-ai';
import { Groq } from 'groq-sdk';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// FIXED ADMINS & PAYPAL ENGINE MATRIX
const ORION_ADMINS = [
    "avijaiswal10052009@gmail.com",
    "Anonymousperson1508@gmail.com"
];
const PAYPAL_BUSINESS_EMAIL = "Ishansrivastava651@gmail.com";

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { action } = req.query;

    try {
        // ==========================================
        // 1. QUICK USER SYNC ENGINE (WITHOUT PASSWORD)
        // ==========================================
        if (action === 'sync-user' && req.method === 'POST') {
            const { email } = req.body;
            if (!email) return res.status(400).json({ error: 'Email missing h bhai!' });

            let { data: user } = await supabase.from('user_subscriptions').select('*').eq('email', email).single();

            let targetStatus = 'free';
            let initialTrials = 5;

            // Direct check for admin access bypass
            if (ORION_ADMINS.includes(email)) {
                targetStatus = 'admin';
                initialTrials = 999999;
            }

            if (!user) {
                const { data: newUser, error: insErr } = await supabase
                    .from('user_subscriptions')
                    .insert([{ 
                        email: email, 
                        access_token: `OAUTH_${Math.random().toString(36).substring(2,8).toUpperCase()}`,
                        status: targetStatus,
                        trials_left: initialTrials
                    }])
                    .select().single();
                if (insErr) throw insErr;
                user = newUser;
            }

            return res.status(200).json({ success: true, user });
        }

        // ==========================================
        // 2. CONFIG ROUTER: HARDCODED CONFIG BACKUPS
        // ==========================================
        if (action === 'get-config' && req.method === 'GET') {
            let { data, error } = await supabase.from('orion_config').select('*').eq('id', 1).single();
            if (error) {
                // System Fallback values if table doesn't exist yet
                return res.status(200).json({
                    weekly_price: 350, monthly_base: 2500, monthly_discount: 30,
                    yearly_base: 10000, yearly_discount: 40, paypal_email: PAYPAL_BUSINESS_EMAIL
                });
            }
            data.paypal_email = PAYPAL_BUSINESS_EMAIL; 
            return res.status(200).json(data);
        }

        if (action === 'save-config' && req.method === 'POST') {
            const updates = req.body;
            await supabase.from('orion_config').update(updates).eq('id', 1);
            return res.status(200).json({ success: true });
        }

        if (action === 'submit-feedback' && req.method === 'POST') {
            const { email, rating, text } = req.body;
            await supabase.from('user_feedbacks').insert([{ email, rating_stars: rating, feedback_text: text }]);
            return res.status(201).json({ success: true });
        }

        // ==========================================
        // 3. API FALLBACK ROTATOR INTERFACES (ADMIN)
        // ==========================================
        if (action === 'add-api-key' && req.method === 'POST') {
            const { provider, api_key } = req.body;
            await supabase.from('api_keys').insert([{ provider, api_key, status: 'active' }]);
            return res.status(201).json({ success: true });
        }

        // ==========================================
        // 4. MAIN MULTIMODAL AI ROTATOR ENGINE
        // ==========================================
        if (req.method === 'POST' && !action) {
            const { email, textInput, imageBase64, currentTool } = req.body;

            let { data: user } = await supabase.from('user_subscriptions').select('*').eq('email', email).single();
            
            // Bypass security entirely for your two admin accounts
            let isUserAdmin = ORION_ADMINS.includes(email) || (user && user.status === 'admin');

            if (!isUserAdmin && user && user.status === 'free' && user.trials_left <= 0) {
                return res.status(403).json({ planBlocked: true, message: "Bhai free trials over ho chuke hain!" });
            }

            const { data: keys, error: kErr } = await supabase.from('api_keys').select('*').eq('status', 'active');
            if (kErr || !keys || keys.length === 0) return res.status(500).json({ error: "API key loop missing h dynamic storage me." });

            const geminiKeys = keys.filter(k => k.provider === 'gemini');
            const groqKeys = keys.filter(k => k.provider === 'groq');
            let finalAIResponse = "";

            if (imageBase64 || currentTool === 'thumb_audit' || currentTool === 'pitch') {
                if (geminiKeys.length === 0) throw new Error("No active Gemini keys found.");
                for (let i = 0; i < geminiKeys.length; i++) {
                    try {
                        const aiStudio = new GoogleGenAI({ apiKey: geminiKeys[i].api_key });
                        const model = aiStudio.getGenerativeModel({ model: "gemini-2.0-flash" });
                        const prompt = `Act as an expert content auditor for tool: ${currentTool}. Context: ${textInput}`;
                        const imageParts = imageBase64 ? [{ inlineData: { data: imageBase64.split(',')[1] || imageBase64, mimeType: "image/jpeg" } }] : [];
                        
                        const result = await model.generateContent([prompt, ...imageParts]);
                        finalAIResponse = result.response.text();
                        break;
                    } catch (err) {
                        if (i === geminiKeys.length - 1) throw err;
                    }
                }
            } else {
                if (groqKeys.length === 0) throw new Error("No active Groq keys found.");
                for (let i = 0; i < groqKeys.length; i++) {
                    try {
                        const groq = new Groq({ apiKey: groqKeys[i].api_key });
                        const chatCompletion = await groq.chat.completions.create({
                            messages: [{ role: 'user', content: `Act as a Viral Creator Engine for tool: ${currentTool}. Context: ${textInput}` }],
                            model: 'llama-3.3-70b-versatile',
                        });
                        finalAIResponse = chatCompletion.choices[0].message.content;
                        break;
                    } catch (err) {
                        if (i === groqKeys.length - 1) throw err;
                    }
                }
            }

            if (user && user.status === 'free' && !isUserAdmin) {
                await supabase.from('user_subscriptions').update({ trials_left: user.trials_left - 1 }).eq('email', email);
            }

            return res.status(200).json({ response: finalAIResponse });
        }

        return res.status(405).json({ error: 'Method framework not defined' });

    } catch (globalError) {
        return res.status(500).json({ error: "Lafda execution error: " + globalError.message });
    }
                }
                     
