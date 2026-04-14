class OutputNode:
    """Prepare the assistant response and convert it into speech output."""

    def __init__(self, tts_service):
        """Store the text-to-speech service dependency used by this node."""
        self.tts_service = tts_service

    def generate_response(self, user_message):
        """Create a placeholder text reply for the provided user message."""
        # This is a temporary stub and can be replaced with an LLM-backed response.
        response_text = f"Response to: {user_message}"
        return response_text

    def convert_to_speech(self, response_text):
        """Convert the generated response text into speech audio data."""
        audio_data = self.tts_service.convert_text_to_speech(response_text)
        return audio_data

    def process_output(self, user_message):
        """Run the full output stage: generate the reply and synthesize audio."""
        response_text = self.generate_response(user_message)
        audio_data = self.convert_to_speech(response_text)
        return audio_data