/**
 * Text-to-Speech Helper using browser's SpeechSynthesis API
 */

export function speakText(text: string, rate: number = 0.85): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      console.warn("Speech synthesis not supported in this environment.");
      resolve(false);
      return;
    }

    try {
      // Cancel outstanding synthetic speech to prevent queuing overlap delays
      window.speechSynthesis.cancel();

      // Clean the text slightly for proper voicing (e.g. remove blank lines if present)
      const cleanText = text.replace(/_+/g, "something").trim();
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = "en-US";
      utterance.rate = rate;

      // Locate premium/natural sounding US English voice if available
      const voices = window.speechSynthesis.getVoices();
      let bestVoice = voices.find(v => v.lang === "en-US" && v.name.includes("Google"));
      if (!bestVoice) {
        bestVoice = voices.find(v => v.lang === "en-US" && v.name.includes("Natural"));
      }
      if (!bestVoice) {
        bestVoice = voices.find(v => v.lang.startsWith("en-US"));
      }
      if (!bestVoice) {
        bestVoice = voices.find(v => v.lang.startsWith("en"));
      }
      
      if (bestVoice) {
        utterance.voice = bestVoice;
      }

      utterance.onend = () => {
        resolve(true);
      };

      utterance.onerror = (err) => {
        console.error("TTS Speech Utterance Error", err);
        resolve(false);
      };

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.error("Speech Synthesis Exception", e);
      resolve(false);
    }
  });
}
