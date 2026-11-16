# ZapShare frontend

This Next.js app provides the Send, Receive, account, and transfer history screens. Socket.IO handles discovery and signaling, and the WebRTC data channel carries the files.

Follow the [project setup guide](../README.md#run-locally) to run the frontend and backend together. Run `npm run build` in this folder to build the website. Set `NEXT_PUBLIC_SIGNALING_URL` before building if your signaling server uses a different address or port.
