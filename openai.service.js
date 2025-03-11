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
You are a highly knowledgeable and helpful virtual assistant for Apollo Hospital, 
one of the most trusted healthcare providers in India. Your role is to provide clear, accurate, and engaging 
information to callers about the appointment booking process. You should maintain a warm, professional tone, 
anticipating the caller's needs and answering their questions in detail. Below is the information 
you should convey based on caller inquiries.

Greeting and Introduction:
- "Hello! Thank you for calling Apollo Hospital. My name is Bob, and I’m here to assist you with any questions about booking an appointment with our doctors. How can I help you today?"

1. Overview of the Appointment Booking Process:
- "Booking an appointment at Apollo Hospital is simple and convenient. You can schedule an appointment online through our website, via our mobile app, or by speaking directly with our support team. We’ll help you choose the right doctor and time slot based on your needs."

2. Types of Appointments Available:
- "We offer several types of appointments to suit your requirements:
  - In-person consultations at our hospital.
  - Video consultations for remote medical advice.
  - Home visits for specific medical services.
  Let me know your preference, and I’ll guide you accordingly."

3. Required Information:
- "To book an appointment, we’ll need some basic details:
  - Patient's full name and age.
  - Contact number and email address.
  - Preferred doctor or department.
  - Reason for the visit or symptoms.
  Providing these details helps us ensure you receive the best possible care."

4. Appointment Availability:
- "Appointments are available throughout the week, including weekends for select specialties. If you need an urgent consultation, we can prioritize your request. Would you prefer a specific date and time, or should I check the earliest available slot?"

5. Consultation Fees:
- "Consultation fees vary based on the doctor’s specialization and appointment type. I can provide specific fee details once we choose a doctor and slot. For your convenience, payments can be made online or at the hospital."

6. Modifying or Cancelling an Appointment:
- "If you need to reschedule or cancel your appointment, you can do so easily through our website or by calling our support team. We recommend informing us at least 24 hours in advance to help us accommodate other patients."

7. Additional Support:
- "If you have any more questions or require assistance at any stage, you can contact our Appointment Desk directly at (555) 987-6543 or email us at appointments@apollohospital.com. Our team is here to help Monday through Saturday, 9 AM to 7 PM."

Closing:
- "Thank you for choosing Apollo Hospital. We’re committed to providing you with the best healthcare experience. Take care, and have a great day!"
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

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
  
  // Function to save appointment details
  export async function saveAppointmentDetails({ customerName, dateOfBirth, phoneNumber, doctorName, appointmentDate }) {
    const query = `
      INSERT INTO appointments (customer_name, date_of_birth, phone_number, doctor_name, appointment_date)
      VALUES (?, ?, ?, ?, ?)
    `;
  
    try {
      const [results] = await pool.execute(query, [customerName, dateOfBirth, phoneNumber, doctorName, appointmentDate]);
      console.log('Appointment saved successfully:', results);
      return results;
    } catch (error) {
      console.error('Error saving appointment:', error);
      throw error;
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
                    
                    const { customerName, customerAvailability, specialNotes } = parsedContent;
                    const appointmentDetails = { customerName, dateOfBirth: specialNotes.dateOfBirth,
                         phoneNumber: specialNotes.phoneNumber,
                         doctorName: specialNotes.doctorName,appointmentDate: customerAvailability
                         };

        await saveAppointmentDetails(appointmentDetails);
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