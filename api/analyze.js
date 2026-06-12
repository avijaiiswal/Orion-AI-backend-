import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/generative-ai';
import { Groq } from 'groq-sdk';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// CORE CONFIG: Admins and Payments Emails Locked
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
        // =======================================================
        // GOOGLE AUTH / USER SYNC MODULE
        // =======================================================
        if (action === 'sync-user' && req.method === 'POST') {
            const { email } = req.body;
            if (!email) return res.status(400).json({ error: 'Email missing' });

            // Check if user already exists in database
            let { data: user, error } = await supabase
                .from('user_subscriptions')
                .select('*')
                .eq('email', email)
                .single();

            // Determing role based on your inputs
            let assignedStatus = 'free';
            let initialTrials = 5;

            if (ORION_ADMINS.includes(email)) {
                assignedStatus = 'admin';
                initialTrials = 999999;
            }

            // If new user logins via Google, create their row automatically
            if (!user) {
                const { data: newUser, error: insertErr } = await supabase
                    .from('user_subscriptions')
                    .insert([{ 
                        email: email, 
                        access_token: `GOOGLE_AUTH_${Math.random().toString(36).substring(2,7).toUpperCase()}`,
                        status: assignedStatus,
                        trials_left: initialTrials
                    }])
                    .select()
                    .single();
                
                if (insertErr) throw insertErr;
                user = newUser;
            } else if (ORION_ADMINS.includes(email) && user.status !== 'admin') {
                // Force update if rule changed
                const { data: updatedUser } = await supabase
                    .from('user_subscriptions')
                    .update({ status: 'admin', trials_left: 999999 })
                    .eq('email', email)
                    .select()
                    .single();
                user = updatedUser;
            }

            return res.status(200).json({ success: true, user });
        }

        // =======================================================
        // GET CONFIG: Injecting PayPal Email Dynamically
        // =======================================================
        if (action === 'get-config' && req.method === 'GET') {
            let { data, error } = await supabase.from('orion_config').select('*').eq('id', 1).single();
            if (error) throw error;
            
            // Hardcode or fallback to your PayPal target
            data.paypal_email = PAYPAL_BUSINESS_EMAIL;
            return res.status(200).json(data);
        }

        // --- Bachi hui saari routes (AI generation, feedback) exact same rahengi ---
        // (Jo pichle response me Core AI logic diya tha, wo iske neeche lag jayega)

    } catch (globalError) {
        return res.status(500).json({ error: "Backend issue: " + globalError.message });
    }
}
