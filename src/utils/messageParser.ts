export function parseMessage(input: any) {
  const result = {
    text: "",
    imageBase64: null as string | null,
    hasImage: false,
    hasText: false,
  };

  if (typeof input === "string") {
    result.text = input.trim();
    result.hasText = true;
  }

  if (typeof input === "object" && input !== null) {

    if (input.text) {
      result.text = input.text.trim();
      result.hasText = true;
    }

    if (input.imageBase64) {
      result.imageBase64 = input.imageBase64;
      result.hasImage = true;
    }

    if (input.videoBase64) {
      console.log("🎥 Video uploaded (not using OCR on video yet)");
    }
  }

  return result;
}
