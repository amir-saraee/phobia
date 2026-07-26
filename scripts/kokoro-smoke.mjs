import { KokoroTTS } from "kokoro-js";
const t0 = Date.now();
const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "fp16" });
console.log("model ready in", ((Date.now()-t0)/1000).toFixed(1), "s");
const audio = await tts.generate("Take a moment. Notice the room before you walk in.", { voice: "af_heart", speed: 0.9 });
await audio.save("/private/tmp/claude-501/-Users-my-mac-Desktop-fobia-project/6e570528-db0f-4e61-8294-2fbb196061ec/scratchpad/kokoro-test.wav");
console.log("render+save in", ((Date.now()-t0)/1000).toFixed(1), "s total");
