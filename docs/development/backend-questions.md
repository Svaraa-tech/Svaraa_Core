# Questions for the backend team

Simple list, written so each question can be answered with a short reply. Tick the box and write the answer next to it. Source: a review of the
frontend against `docs/openapi.json` and the `svaraa-backend` repo (24 Nov 2026). Answers will update [Features](02-features.md).

Please also say **which server** each answer is about (Render dev today, or a newer one).

## A. What is deployed

1. [ ] The backend repo I read has a voice socket that takes a sign-in token (`Authorization: Bearer` or `?token=`), `conversation_id`, `reply_format=pcm16`, and sends `reply_start` / `reply_end`. **Is this already on Render?** If not, when?
2. [ ] The repo has uncommitted work on **reminder responses** (done / pending for each time a reminder fires). Is it coming? Will the response include who answered and when? What will the endpoints be?
3. [ ] Backend PR #25 ("one player at a time", the `spotify` chat event): is it merged and on Render? I could not see it in the local git log.
4. [ ] `docs/youtube-design.md` is mentioned in our docs but not in the backend repo. Where is it, and is any YouTube endpoint planned?

## B. Sign-in and account

5. [ ] Does Render send real SMS (TextBee), or only the fixed code `0000`? When will production use a real provider?
6. [ ] Can `GET /users/me` return the verified mobile number (or a `mobile_verified` true/false)? Today the app remembers the number on the phone, so a Google user on a new phone is asked again.
7. [ ] Does `/chat/` need sign-in now, or is it still public?
8. [ ] Web sign-in: tokens are kept in browser storage. Do you plan cookies, as a code comment says? What should the web app do?
9. [ ] Please add `http://localhost:8081` (Expo web) to `CORS_ORIGINS` on Render, or tell us to always use port 5173.

## C. Household, pendant, setup

10. [ ] The app was designed with an "owner" (ownership transfer, "ask the owner"). The backend now has only roles (`wearer`, `admin`, `viewer`). Confirm there is **no owner**, and who can do what (invite, approve, remove, release).
11. [ ] What is `POST /devices/{id}/pairing/complete` for, and when must the app call it (after `verify`)?
12. [ ] Pendant claim codes: what format do real codes have? (We guessed `SVRA-2041-7K3P` and a QR link `https://svaraa.ai/c/<code>`.) Are the test codes still "anything starting with MOCK"?
13. [ ] Pairing: confirm the signature is Ed25519 over the raw nonce, base64url. Which test pendants (with keys, or key-less "press only") can we use?
14. [ ] Consent for a wearer who sets up first: where does the app get the consent text and version? Only setup-link preview seems to return it.
15. [ ] When the SOS drill (or a real SOS) fires, how are contacts alerted if there is no push in v0? Is there SMS or calling on the server?
16. [ ] Emergency contact edit: is `PATCH /contacts/{id}` ready to use? (The app deletes and re-adds today.)
17. [ ] Is there an endpoint for the app to read the wearer's profile (name, languages, date of birth)? We keep it on the phone.

## D. Things the backend has that the app has not built

Please tell us the order you want, and if any is not final:

18. [ ] Setup link and setup invites (D6-D8), `/me/pending-invites`: is the contract final? Which web page will serve `svaraa.ai/j/<token>`, and are app links (AASA, assetlinks.json) planned?
19. [ ] Members (list, role change, approve, reject, remove), step-up code, caretaker and wearer transfers, cancel household, release pendant, disputes, consent withdraw: are all final and tested?
20. [ ] Step-up code (`POST /me/step-up`): is it always sent to the person's own phone? How long is it valid and what happens after wrong tries?

## E. Apps

21. [ ] Notes: `POST /notes` returned `503 notes_unavailable` on Render (20 Nov). Is storage and transcription configured now?
22. [ ] Spotify: which error codes come for "no Premium" and "no open device"? Is the sign-in return page (`SPOTIFY_APP_RETURN_URL`) ready for the app?
23. [ ] News: is `GET /news` final (categories, not regions)? Can a summary written by AI be added later, and is a region filter planned?
24. [ ] Music: are playlists planned, or only the two categories (old songs, bhajans)?
25. [ ] Voice text to speech is edge-tts in the code, but `.env.example` still lists ElevenLabs. Which is real? Will recognition stay Hindi only?

## F. Errors and contract

26. [ ] We invented some error codes in the app (`invalid_claim_code`, `device_already_claimed`, `invalid_device_signature`, `drill_not_found`, `drill_not_running`, `invite_role_invalid`). Please send the **real list of error codes per endpoint**, or add them to the OpenAPI spec.
27. [ ] Which branch or URL should we treat as the source of truth for `openapi.json`, and how will we hear about changes?
28. [ ] Staging and production: will there be separate servers, and when? We need their URLs for the app builds.
