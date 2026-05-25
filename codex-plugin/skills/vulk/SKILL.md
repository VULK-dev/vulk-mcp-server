---
name: vulk
description: Use VULK to generate, edit, inspect, and deploy immersive web projects from Codex.
---

# VULK

Use VULK when the user asks to build, remix, inspect, edit, or deploy a website or web app from chat.

Prefer `generate_immersive_site` for briefs that mention:

- 3D, WebGL, Three.js, R3F, spatial interfaces, or product reveals
- cinematic motion, video references, scroll-driven storytelling, or immersive sites
- moodboards, screenshots, Figma, URLs, product images, or visual references

Use `create_project` for general web projects.

Use `get_project_files` without `includeContent` first. Request file content only when needed, and request specific paths. Do not request secrets, `.env` files, credentials, private keys, certificates, `.npmrc`, `.pypirc`, `.netrc`, or service-account files.

Return the VULK project ID, preview URL, editor URL, and deployment URL when available. Do not describe VULK as a raw image, video, or audio generation API; VULK delivers editable web projects.
