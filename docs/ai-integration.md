# AI product discovery

- **Provider/model:** Google Gemini API; configurable with backend `GEMINI_MODEL` (default `gemini-2.5-flash`).
- **Endpoint:** `POST /api/v1/ai/discover`, rate-limited to 20 requests per IP per hour.
- **Privacy:** Only the bounded shopping prompt and a small set of active in-stock catalog records are sent. No customer name, email, password, token, or shipping details are sent. The key stays in `backend/.env`.
- **Retrieval:** The API queries Supabase for active, in-stock items and applies simple budget/size filters before the prompt. Candidate data includes database IDs and catalog attributes.
- **Prompt strategy:** Fixed system instructions establish the shopping-only task and reject instruction/secret disclosure; customer text is length-limited and explicitly delimited as untrusted data.
- **Validation:** Gemini is asked for JSON containing product IDs. The API parses the response, checks its shape, discards IDs outside the retrieved candidates, de-duplicates and caps recommendations, and then constructs product details from the original database records. The model's prose is not returned as authoritative product data.
- **Failure:** Missing key, timeout/network/provider error, malformed JSON, or invalid response returns a controlled 503 `AI_UNAVAILABLE`. An empty database match returns a safe no-match result.
- **Abuse/cost controls:** 500-character input limit, per-IP rate limit, 12-second request timeout, 300 output-token limit, and at most 30 product candidates.

The UI labels recommendations as AI-assisted and displays catalog data from the API.
