module.exports = async function handler(req, res) {
    // These environment variables MUST be set in your Vercel project settings:
    const serviceId = process.env.EMAILJS_SERVICE_ID;
    const templateId = process.env.EMAILJS_NOTIFY_TEMPLATE_ID;
    const publicKey = process.env.EMAILJS_PUBLIC_KEY;
    const privateKey = process.env.EMAILJS_PRIVATE_KEY; // Optional, only if EmailJS requires it
    const toEmail = process.env.TARGET_EMAIL; // The email address to receive the reminder

    if (!serviceId || !templateId || !publicKey || !toEmail) {
        console.error("Missing Environment Variables");
        return res.status(500).json({ error: 'Missing environment variables for EmailJS or Target Email.' });
    }

    try {
        const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                service_id: serviceId,
                template_id: templateId,
                user_id: publicKey,
                accessToken: privateKey,
                template_params: {
                    to_email: toEmail,
                    to_name: 'Learning Data Engineer',
                    entry_title: '🔔 Automated Daily Study Reminder',
                    entry_phase: 'DE Journal Background Service',
                    entry_date: new Date().toLocaleDateString(),
                    entry_hours: 'Your Daily Target',
                    entry_difficulty: 'Consistency is Key',
                    entry_summary: 'Your Vercel server is reminding you to open your journal and study today. Keep up the great work!'
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('EmailJS error response:', errorText);
            return res.status(500).json({ error: 'EmailJS failed to send', details: errorText });
        }

        console.log("Automated background reminder sent successfully to:", toEmail);
        return res.status(200).json({ success: true, message: 'Automated background reminder sent!' });
    } catch (error) {
        console.error('Fetch error:', error);
        return res.status(500).json({ error: 'Failed to trigger EmailJS', message: error.message });
    }
}
