import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/generative-ai';
import { Groq } from 'groq-sdk';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// PLATFORM OPERATIONS MATRIX
const ORION_ADMINS = [
    "avijaiswal10052009@gmail.com",
    "Anonymousperson1508@gmail.com"
];
const PAYPAL_BUSINESS_EMAIL = "Ishansrivastava651@gmail.com";
const SUPPORT_EMAIL = "aaosamjhoai@gmail.com";

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { action } = req.query;

    try {
        if (action === 'sync-user' && req.method === 'POST') {
            const { email } = req.body;
            if (!email) return res.status(400).json({ error: 'Email mandatory parameter' });

            let { data: user } = await supabase.from('user_subscriptions').select('*').eq('email', email).single();
            let targetStatus = 'free';
            let initialTrials = 5;

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

        if (action === 'get-config' && req.method === 'GET') {
            let { data, error } = await supabase.from('orion_config').select('*').eq('id', 1).single();
            if (error) {
                return res.status(200).json({
                    weekly_price: 350, monthly_base: 2500, monthly_discount: 30,
                    yearly_base: 10000, yearly_discount: 40, paypal_email: PAYPAL_BUSINESS_EMAIL, support_email: SUPPORT_EMAIL
                });
            }
            data.paypal_email = PAYPAL_BUSINESS_EMAIL; 
            data.support_email = SUPPORT_EMAIL;
            return res.status(200).json(data);
        }

        if (action === 'submit-feedback' && req.method === 'POST') {
            const { email, rating, text } = req.body;
            await supabase.from('user_feedbacks').insert([{ email, rating_stars: rating, feedback_text: text }]);
            return res.status(201).json({ success: true });
        }

        if (req.method === 'POST' && !action) {
            const { email, textInput, imageBase64, currentTool } = req.body;
            let { data: user } = await supabase.from('user_subscriptions').select('*').eq('email', email).single();
            
            let isUserAdmin = ORION_ADMINS.includes(email) || (user && user.status === 'admin');

            if (!isUserAdmin && user && user.status === 'free' && user.trials_left <= 0) {
                return res.status(403).json({ planBlocked: true, message: "Bhai free trials over ho chuke hain!" });
            }

            const { data: keys, error: kErr } = await supabase.from('api_keys').select('*').eq('status', 'active');
            if (kErr || !keys || keys.length === 0) return res.status(500).json({ error: "No active keys inside rotator loop." });

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
        return res.status(405).json({ error: 'Framework misaligned' });
    } catch (err) {
        return res.status(500).json({ error: "Core engine fault: " + err.message });
    }
    }
                
