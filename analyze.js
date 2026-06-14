import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';

// ── SUPABASE (service-role client — server only, bypasses RLS) ──
// IMPORTANT: SUPABASE_SERVICE_ROLE_KEY must be set as a Vercel env var.
// Never expose this key to the frontend.
const supabase = createClient(
    process.env.SUPABASE_URL="https://zdrmahoktoulfigsmptx.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY="sb_publishable_AGJaamf_G2JUdrco86c2ZQ_yo8nsZ9B"
);

const ORION_ADMINS = [
    "avijaiswal10052009@gmail.com",
    "Anonymousperson1508@gmail.com"
];
const PAYPAL_BUSINESS_EMAIL = "Ishansrivastava651@gmail.com";
const SUPPORT_EMAIL         = "aaosamjhoai@gmail.com";

// ── TOOL PROMPTS ──────────────────────────────────────
function buildPrompt(tool, context) {
    const prompts = {
        pitch:        `You are an expert startup pitch consultant. Create a compelling, structured investor pitch deck outline. Include: Problem, Solution, Market Size, Business Model, Traction, Team, and Ask sections. Be specific and persuasive.\n\nContext: ${context}`,
        cold_email:   `You are a B2B sales expert. Write a high-converting cold email sequence (3 emails). Keep emails short, personalized, and value-focused. Include subject lines.\n\nContext: ${context}`,
        viral_hook:   `You are a viral content strategist for short-form video. Generate 5 ultra-engaging hook scripts for Reels/Shorts. Each hook must grab attention in the first 3 seconds. Use pattern interrupts, curiosity gaps, and emotional triggers.\n\nContext: ${context}`,
        thumb_audit:  `You are a YouTube thumbnail expert. Analyze the provided thumbnail. Rate it out of 10 and give specific actionable feedback on: Visual hierarchy, Text readability, Color contrast, Emotional trigger, CTR potential. Be brutally honest.\n\nContext: ${context}`,
        sponsorship:  `You are a brand partnership specialist. Write a crisp, professional sponsorship pitch email. Include: audience stats placeholder, value proposition, collaboration ideas, and CTA.\n\nContext: ${context}`,
        ecom_listing: `You are an e-commerce copywriting expert. Write an optimized product listing with: SEO title, bullet points (5), detailed description, and keywords. Make it conversion-focused.\n\nContext: ${context}`
    };
    return prompts[tool] || `You are an expert AI assistant. Help with the following:\n\n${context}`;
}

// ── CORS ──────────────────────────────────────────────
function setCors(res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,PUT,PATCH,DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, X-Requested-With, Authorization');
}

// ── VERIFY USER FROM SUPABASE AUTH SESSION TOKEN ─────────
// The frontend sends the Supabase Auth access_token in the
// Authorization: Bearer <token> header. We verify it server-side
// against Supabase Auth — this cannot be spoofed by the client.
async function getVerifiedUser(req) {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return null;

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user; // { id, email, ... }
}

async function verifyAdmin(req) {
    const user = await getVerifiedUser(req);
    if (!user || !user.email) return null;
    return ORION_ADMINS.includes(user.email) ? user : null;
}

// ── MASK API KEY ──────────────────────────────────────
function maskKey(key) {
    if (!key || key.length < 8) return '••••••••';
    return key.substring(0, 6) + '••••••••••••' + key.slice(-4);
}

// ── MAIN HANDLER ──────────────────────────────────────
export default async function handler(req, res) {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { action } = req.query;

    try {

        // ════════════════════════════════════════
        // PUBLIC ROUTES
        // ════════════════════════════════════════

        // ── SYNC USER (called after Supabase Auth login) ──────
        // Requires a verified session token. Email is taken from
        // the verified token, never from the request body.
        if (action === 'sync-user' && req.method === 'POST') {
            const authedUser = await getVerifiedUser(req);
            if (!authedUser || !authedUser.email) {
                return res.status(401).json({ error: 'Not authenticated. Please log in again.' });
            }
            const email = authedUser.email;

            const isAdmin   = ORION_ADMINS.includes(email);
            const newStatus = isAdmin ? 'admin' : 'free';
            const newTrials = isAdmin ? 999999 : 5;

            let { data: user, error: selErr } = await supabase
                .from('user_subscriptions').select('*').eq('email', email).maybeSingle();

            if (selErr) throw selErr;

            if (!user) {
                const { data: newUser, error: insErr } = await supabase
                    .from('user_subscriptions')
                    .insert([{
                        email,
                        access_token: `ORION_${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
                        status:       newStatus,
                        trials_left:  newTrials
                    }])
                    .select().single();
                if (insErr) throw insErr;
                user = newUser;
            } else if (isAdmin && user.status !== 'admin') {
                const { data: updatedUser, error: updErr } = await supabase
                    .from('user_subscriptions')
                    .update({ status: 'admin', trials_left: 999999 })
                    .eq('email', email).select().single();
                if (updErr) throw updErr;
                user = updatedUser;
            }
            return res.status(200).json({ success: true, user });
        }

        // ── GET CONFIG ───────────────────────────────
        if (action === 'get-config' && req.method === 'GET') {
            const { data, error } = await supabase
                .from('orion_config').select('*').eq('id', 1).maybeSingle();
            const defaults = {
                weekly_price: 350, monthly_base: 2500, monthly_discount: 30,
                yearly_base: 10000, yearly_discount: 40,
                paypal_email: PAYPAL_BUSINESS_EMAIL, support_email: SUPPORT_EMAIL
            };
            if (error || !data) return res.status(200).json(defaults);
            return res.status(200).json({ ...data, paypal_email: PAYPAL_BUSINESS_EMAIL, support_email: SUPPORT_EMAIL });
        }

        // ── SUBMIT FEEDBACK ──────────────────────────
        if (action === 'submit-feedback' && req.method === 'POST') {
            const { email, rating, text } = req.body;
            if (!email || !rating) return res.status(400).json({ error: 'Email and rating required.' });
            const { error } = await supabase
                .from('user_feedbacks')
                .insert([{ email, rating_stars: rating, feedback_text: text || '' }]);
            if (error) throw error;
            return res.status(201).json({ success: true });
        }

        // ════════════════════════════════════════
        // ADMIN ROUTES — require verified Supabase Auth session
        // belonging to an email in ORION_ADMINS
        // ════════════════════════════════════════

        // ── GET ALL KEYS (masked) ─────────────────────
        if (action === 'get-keys' && req.method === 'GET') {
            if (!await verifyAdmin(req)) return res.status(403).json({ error: 'Unauthorized.' });

            const { data: keys, error } = await supabase
                .from('api_keys')
                .select('id, provider, api_key, status, usage_count, created_at')
                .order('created_at', { ascending: false });

            if (error) throw error;

            const maskedKeys = keys.map(k => ({ ...k, api_key: maskKey(k.api_key) }));
            return res.status(200).json({ success: true, keys: maskedKeys });
        }

        // ── ADD NEW KEY ───────────────────────────────
        if (action === 'add-key' && req.method === 'POST') {
            if (!await verifyAdmin(req)) return res.status(403).json({ error: 'Unauthorized.' });

            const { provider, api_key } = req.body;
            if (!provider || !api_key) return res.status(400).json({ error: 'Provider and API key required.' });
            if (!['gemini', 'groq', 'openai'].includes(provider)) {
                return res.status(400).json({ error: 'Invalid provider. Use: gemini, groq, openai' });
            }

            const { data, error } = await supabase
                .from('api_keys')
                .insert([{ provider, api_key, status: 'active', usage_count: 0 }])
                .select('id, provider, status, usage_count, created_at').single();

            if (error) throw error;
            return res.status(201).json({ success: true, key: { ...data, api_key: maskKey(api_key) } });
        }

        // ── TOGGLE KEY STATUS (active ↔ exhausted) ────
        if (action === 'toggle-key' && req.method === 'POST') {
            if (!await verifyAdmin(req)) return res.status(403).json({ error: 'Unauthorized.' });

            const { id, status } = req.body;
            if (!id || !status) return res.status(400).json({ error: 'Key ID and status required.' });
            if (!['active', 'exhausted'].includes(status)) {
                return res.status(400).json({ error: 'Status must be: active or exhausted' });
            }

            const { error } = await supabase
                .from('api_keys').update({ status }).eq('id', id);
            if (error) throw error;
            return res.status(200).json({ success: true });
        }

        // ── RESET KEY USAGE COUNT ─────────────────────
        if (action === 'reset-key' && req.method === 'POST') {
            if (!await verifyAdmin(req)) return res.status(403).json({ error: 'Unauthorized.' });

            const { id } = req.body;
            if (!id) return res.status(400).json({ error: 'Key ID required.' });

            const { error } = await supabase
                .from('api_keys').update({ usage_count: 0, status: 'active' }).eq('id', id);
            if (error) throw error;
            return res.status(200).json({ success: true });
        }

        // ── DELETE KEY ────────────────────────────────
        if (action === 'delete-key' && req.method === 'DELETE') {
            if (!await verifyAdmin(req)) return res.status(403).json({ error: 'Unauthorized.' });

            const { id } = req.body;
            if (!id) return res.status(400).json({ error: 'Key ID required.' });

            const { error } = await supabase.from('api_keys').delete().eq('id', id);
            if (error) throw error;
            return res.status(200).json({ success: true });
        }

        // ── UPDATE PRICING ────────────────────────────
        if (action === 'update-pricing' && req.method === 'POST') {
            if (!await verifyAdmin(req)) return res.status(403).json({ error: 'Unauthorized.' });

            const { weekly_price, monthly_base, monthly_discount, yearly_base, yearly_discount } = req.body;
            const { error } = await supabase
                .from('orion_config')
                .update({ weekly_price, monthly_base, monthly_discount, yearly_base, yearly_discount })
                .eq('id', 1);
            if (error) throw error;
            return res.status(200).json({ success: true });
        }

        // ── UPGRADE USER PLAN ─────────────────────────
        if (action === 'upgrade-user' && req.method === 'POST') {
            if (!await verifyAdmin(req)) return res.status(403).json({ error: 'Unauthorized.' });

            const { email, plan } = req.body;
            if (!email || !plan) return res.status(400).json({ error: 'Email and plan required.' });

            const planTrials = { weekly: 50, monthly: 300, ultimate: 999999, admin: 999999 };
            if (!planTrials[plan]) return res.status(400).json({ error: 'Invalid plan.' });

            const { error } = await supabase
                .from('user_subscriptions')
                .update({ status: plan === 'admin' ? 'admin' : plan, trials_left: planTrials[plan] })
                .eq('email', email);
            if (error) throw error;
            return res.status(200).json({ success: true });
        }

        // ── GET FEEDBACKS ─────────────────────────────
        if (action === 'get-feedbacks' && req.method === 'GET') {
            if (!await verifyAdmin(req)) return res.status(403).json({ error: 'Unauthorized.' });

            const { data, error } = await supabase
                .from('user_feedbacks')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50);
            if (error) throw error;
            return res.status(200).json({ success: true, feedbacks: data });
        }

        // ════════════════════════════════════════
        // MAIN AI GENERATE — requires verified session
        // ════════════════════════════════════════
        if (req.method === 'POST' && !action) {
            const authedUser = await getVerifiedUser(req);
            if (!authedUser || !authedUser.email) {
                return res.status(401).json({ error: 'Not authenticated. Please log in again.' });
            }
            const email = authedUser.email;
            const { textInput, imageBase64, currentTool } = req.body;
            if (!textInput) return res.status(400).json({ error: 'Input is required.' });

            let { data: user, error: userErr } = await supabase
                .from('user_subscriptions').select('*').eq('email', email).maybeSingle();
            if (userErr) throw userErr;

            const isAdmin = ORION_ADMINS.includes(email) || (user?.status === 'admin');

            if (!isAdmin && user?.status === 'free' && user?.trials_left <= 0) {
                return res.status(403).json({ planBlocked: true, message: "Free trials over. Please upgrade." });
            }

            // Fetch keys — least used first (round robin)
            const { data: keys, error: kErr } = await supabase
                .from('api_keys').select('*').eq('status', 'active')
                .order('usage_count', { ascending: true });

            if (kErr || !keys || keys.length === 0) {
                return res.status(500).json({ error: "No active API keys found." });
            }

            const geminiKeys = keys.filter(k => k.provider === 'gemini');
            const groqKeys   = keys.filter(k => k.provider === 'groq');
            const prompt     = buildPrompt(currentTool, textInput);
            const needsVision = !!(imageBase64) || currentTool === 'thumb_audit';
            let finalAIResponse = "";

            // ── GEMINI ───────────────────────────────
            if (needsVision || currentTool === 'pitch') {
                if (geminiKeys.length === 0) throw new Error("No active Gemini keys available.");
                for (let i = 0; i < geminiKeys.length; i++) {
                    try {
                        const genAI = new GoogleGenerativeAI(geminiKeys[i].api_key);
                        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
                        let parts = [{ text: prompt }];
                        if (imageBase64) {
                            const mimeMatch  = imageBase64.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,/);
                            const mimeType   = mimeMatch ? mimeMatch[1] : "image/jpeg";
                            const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
                            parts.push({ inlineData: { data: base64Data, mimeType } });
                        }
                        const result = await model.generateContent(parts);
                        finalAIResponse = result.response.text();
                        await supabase.from('api_keys')
                            .update({ usage_count: (geminiKeys[i].usage_count || 0) + 1 })
                            .eq('id', geminiKeys[i].id);
                        break;
                    } catch (err) {
                        await supabase.from('api_keys').update({ status: 'exhausted' }).eq('id', geminiKeys[i].id);
                        if (i === geminiKeys.length - 1) throw new Error("All Gemini keys exhausted.");
                    }
                }

            // ── GROQ ─────────────────────────────────
            } else {
                if (groqKeys.length === 0) throw new Error("No active Groq keys available.");
                for (let i = 0; i < groqKeys.length; i++) {
                    try {
                        const groq = new Groq({ apiKey: groqKeys[i].api_key });
                        const completion = await groq.chat.completions.create({
                            model: 'llama-3.3-70b-versatile',
                            messages: [{ role: 'user', content: prompt }],
                            max_tokens: 1024, temperature: 0.8
                        });
                        finalAIResponse = completion.choices[0].message.content;
                        await supabase.from('api_keys')
                            .update({ usage_count: (groqKeys[i].usage_count || 0) + 1 })
                            .eq('id', groqKeys[i].id);
                        break;
                    } catch (err) {
                        await supabase.from('api_keys').update({ status: 'exhausted' }).eq('id', groqKeys[i].id);
                        if (i === groqKeys.length - 1) throw new Error("All Groq keys exhausted.");
                    }
                }
            }

            // Deduct trial
            let newTrialsLeft = user?.trials_left ?? 0;
            if (!isAdmin && user?.status === 'free') {
                newTrialsLeft = Math.max(0, user.trials_left - 1);
                await supabase.from('user_subscriptions')
                    .update({ trials_left: newTrialsLeft }).eq('email', email);
            }

            return res.status(200).json({ response: finalAIResponse, trials_left: newTrialsLeft });
        }

        return res.status(405).json({ error: 'Method not allowed.' });

    } catch (err) {
        console.error('[Orion Error]', err.message);
        return res.status(500).json({ error: "Server error: " + err.message });
    }
}
