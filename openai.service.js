import WebSocket from "ws";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
export function getOpenaiWebsocketInstance() {
    return new WebSocket(
        "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01",
        {
            headers: {
                Authorization: `Bearer ${OPENAI_API_KEY}`,
                "OpenAI-Beta": "realtime=v1",
            },
        },
    );
}

const SYSTEM_MESSAGE = `
You are a highly knowledgeable and helpful virtual assistant for Desert Sands Charter School, 
a well-regarded charter school in California. Your role is to provide clear, accurate, and engaging 
information to callers about the registration process. You should maintain a warm, professional tone, 
anticipating the caller's needs and answering their questions in detail. Below is the information 
you should convey based on caller inquiries.

Greeting and Introduction:
- "Hello! Thank you for calling Desert Sands Charter School. My name is Bob, and I’m here to assist you with any questions about registering a student with our school. How can I help you today?"

1. Overview of the Registration Process:
- "Our registration process is designed to be simple and accessible. You’ll start by submitting an application online through our portal. After that, our enrollment team will review your application and schedule a follow-up to confirm details and collect required documentation. Once verified, your child will be officially enrolled and ready to start!"

2. Eligibility Requirements:
- "To enroll, students must meet the following eligibility criteria:
  - Age: Students must be between 5 and 18 years old for most programs. We also offer a Young Adult Program for students up to 24 years old.
  - Residency: We welcome students from anywhere in California, as we’re a state-approved charter school.
  - Additional Criteria: Some specialized programs may have specific requirements, which I’d be happy to explain if you’re interested."

3. Required Documents:
- "You’ll need the following documents to complete registration:
  - Proof of residency, such as a utility bill or rental agreement.
  - Your child’s birth certificate or another legal proof of age.
  - Academic records, including transcripts or report cards from previous schools.
  - Up-to-date immunization records, as required by California state law.
  If you’re missing any of these, let us know—we can guide you on how to proceed."

4. Enrollment Period:
- "Desert Sands Charter School offers year-round enrollment, so you can register at any time. However, we recommend starting the process early to ensure your child has access to their preferred classes and programs. If there are specific deadlines for specialized programs, we’ll let you know during the application process."

5. Programs and Services:
- "We offer a variety of educational programs to fit different learning needs:
  - Traditional in-person classes.
  - Online and hybrid learning models for flexible schedules.
  - Specialized tracks in STEM, arts, and career technical education.
  Additionally, we provide support services like tutoring, counseling, and extracurricular activities such as sports, music, and robotics clubs."

6. Starting the Registration Process:
- "To begin, visit our website at www.desertsandscharter.edu and click on the ‘Enroll Now’ button. The application form will guide you through the steps. You can also visit our campus for in-person assistance, or email us your questions at enroll@desertsandscharter.edu. Our enrollment advisors are always happy to help!"

7. Fees:
- "Good news! There are no application or registration fees. As a public charter school, enrollment is entirely free for California residents."

8. Additional Support:
- "If you have more questions or need assistance at any stage, you can contact our Enrollment Department directly at (555) 123-4567 or email us at enroll@desertsandscharter.edu. Our friendly team is here to help Monday through Friday, 8 AM to 5 PM."

Closing:
- "Thank you for considering Desert Sands Charter School! If you have any further questions, feel free to reach out. Have a great day!"
`;

export const VOICE = "alloy";

// List of Event Types to log to the console
export const LOG_EVENT_TYPES = [
    "response.content.done",
    "rate_limits.updated",
    "response.done",
    "input_audio_buffer.committed",
    "input_audio_buffer.speech_stopped",
    "input_audio_buffer.speech_started",
    "session.created",
    "response.text.done",
    "conversation.item.input_audio_transcription.completed",
];

export async function sendSessionUpdate(connection) {
    const sessionUpdate = {
        type: "session.update",
        session: {
            turn_detection: { type: "server_vad" },
            input_audio_format: "g711_ulaw",
            output_audio_format: "g711_ulaw",
            voice: VOICE,
            instructions: SYSTEM_MESSAGE,
            modalities: ["text", "audio"],
            temperature: 0.8,
            input_audio_transcription: {
                model: "whisper-1",
            },
        },
    };
    console.log("Sending session update:", JSON.stringify(sessionUpdate));
    connection.send(JSON.stringify(sessionUpdate));
}

// Function to make ChatGPT API completion call with structured outputs
async function makeChatGPTCompletion(transcript) {
    console.log("Starting ChatGPT API call...");
    try {
        const response = await fetch(
            "https://api.openai.com/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${OPENAI_API_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: "gpt-4o-2024-08-06",
                    messages: [
                        {
                            role: "system",
                            content:
                                "Extract customer details: name, availability, and any special notes from the transcript (you can add the customer's problem to the special notes). Return customer's availability as a date in ISO 8601 format. Today's date is " +
                                new Date().toLocaleString(),
                        },
                        { role: "user", content: transcript },
                    ],
                    response_format: {
                        type: "json_schema",
                        json_schema: {
                            name: "customer_details_extraction",
                            schema: {
                                type: "object",
                                properties: {
                                    customerName: { type: "string" },
                                    customerAvailability: { type: "string" },
                                    specialNotes: { type: "string" },
                                },
                                required: [
                                    "customerName",
                                    "customerAvailability",
                                    "specialNotes",
                                ],
                            },
                        },
                    },
                }),
            },
        );

        console.log("ChatGPT API response status:", response.status);
        const data = await response.json();
        console.log(
            "Full ChatGPT API response:",
            JSON.stringify(data, null, 2),
        );
        return data;
    } catch (error) {
        console.error("Error making ChatGPT completion call:", error);
        throw error;
    }
}

// Function to send data to Make.com webhook
async function sendToWebhook(url, payload) {
    console.log("Sending data to webhook:", JSON.stringify(payload, null, 2));
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        console.log("Webhook response status:", response.status);
        if (response.ok) {
            console.log("Data successfully sent to webhook.");
        } else {
            console.error(
                "Failed to send data to webhook:",
                response.statusText,
            );
        }
    } catch (error) {
        console.error("Error sending data to webhook:", error);
    }
}

// Main function to extract and send customer details
export async function processTranscriptAndSend(
    transcript,
    url,
    sessionId = null,
) {
    console.log(`Starting transcript processing for session ${sessionId}...`);
    try {
        // Make the ChatGPT completion call
        const result = await makeChatGPTCompletion(transcript);

        console.log(
            "Raw result from ChatGPT:",
            JSON.stringify(result, null, 2),
        );

        if (
            result.choices &&
            result.choices[0] &&
            result.choices[0].message &&
            result.choices[0].message.content
        ) {
            try {
                const parsedContent = JSON.parse(
                    result.choices[0].message.content,
                );
                console.log(
                    "Parsed content:",
                    JSON.stringify(parsedContent, null, 2),
                );

                if (parsedContent) {
                    // Send the parsed content directly to the webhook
                    await sendToWebhook(url, parsedContent);
                    console.log(
                        "Extracted and sent customer details:",
                        parsedContent,
                    );
                } else {
                    console.error(
                        "Unexpected JSON structure in ChatGPT response",
                    );
                }
            } catch (parseError) {
                console.error(
                    "Error parsing JSON from ChatGPT response:",
                    parseError,
                );
            }
        } else {
            console.error("Unexpected response structure from ChatGPT API");
        }
    } catch (error) {
        console.error("Error in processTranscriptAndSend:", error);
    }
}