// Sakelar fitur AI. Selain "true" persis — termasuk tidak diisi — berarti MATI:
// default aman, karena Gemini masih free tier dan data klien belum boleh lewat
// sana. Dibaca juga di browser lewat `env` di next.config.mjs (tertanam saat
// build), jadi mengubahnya di Vercel butuh redeploy.
export const AI_NONAKTIF = 'Fitur AI belum diaktifkan.'

export const aiFeaturesEnabled = (v = process.env.AI_FEATURES_ENABLED) => v === 'true'
