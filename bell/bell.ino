#include <Arduino.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include "time.h"
#include <ArduinoJson.h>

// WiFi credentials
const char* ssid = "WRATH";
const char* password = "123456789";

// MQTT broker details
const char* mqtt_server = "broker.emqx.io";
const int mqtt_port = 1883;

// MQTT topics
const char* topic_schedule = "bell/schedule";
const char* topic_emergency = "bell/emergency";
const char* topic_ring_status = "bell/ringing";

// Pins
const int bellPin = 5;      // Bell/Buzzer relay pin
const int buttonPin = 4;    // Manual button pin

// LCD setup
LiquidCrystal_I2C lcd(0x27, 16, 2);  // Change address if needed

// Globals
WiFiClient espClient;
PubSubClient client(espClient);

String scheduledTime = "";
bool bellRang = false;

String periodTimes[11];  // Period slots
bool periodRang[11];

bool examMode = false;
unsigned long examEndEpoch = 0;
bool examBellRang = false;

bool emergencyBellMode = false;

// Button handling
int lastButtonState = HIGH;
int lastButtonReading = HIGH;
unsigned long lastDebounceTime = 0;
const unsigned long debounceDelay = 50;

bool buzzerManualState = false;

void setup() {
  Serial.begin(115200);

  pinMode(bellPin, OUTPUT);
  digitalWrite(bellPin, LOW);

  pinMode(buttonPin, INPUT_PULLUP);

  Wire.begin(21, 22);
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("Smart Bell Ready");

  connectWiFi();

  configTime(19800, 0, "pool.ntp.org", "time.nist.gov");

  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
  reconnect();

  for (int i = 0; i < 11; i++) periodRang[i] = false;
}

void loop() {
  if (!client.connected()) reconnect();
  client.loop();

  handleButtonPress();  // Check button state

  // Manual buzzer control
  if (buzzerManualState) {
    digitalWrite(bellPin, HIGH);
  } else if (!emergencyBellMode) {
    digitalWrite(bellPin, LOW);
  }

  if (emergencyBellMode) {
    ringBellContinuous();
    return;
  }

  if (scheduledTime == "" && !examMode) {
    displayTime();
    delay(500);
    return;
  }

  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    Serial.println("Failed to get time");
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Time Error");
    delay(1000);
    return;
  }

  char currentTime[6];
  strftime(currentTime, sizeof(currentTime), "%H:%M", &timeinfo);

  Serial.print("Current IST Time: ");
  Serial.println(currentTime);

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Time: ");
  lcd.print(currentTime);

  // Scheduled time bell
  if (!bellRang && scheduledTime == String(currentTime)) {
    ringBell();
    bellRang = true;
  }

  // Period bells
  for (int i = 0; i < 11; i++) {
    if (periodTimes[i] != "" && !periodRang[i]) {
      if (periodTimes[i] == String(currentTime)) {
        Serial.printf("🔔 Period Slot %d bell ringing!\n", i + 1);

        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.printf("Period %d", i + 1);
        lcd.setCursor(0, 1);
        lcd.print("Bell Ringing!");

        ringBell();
        periodRang[i] = true;
      }
    }
  }

  // Exam mode bell
  if (examMode && !examBellRang) {
    time_t now;
    time(&now);

    if (now >= examEndEpoch) {
      Serial.println("🔔 Exam End Bell Ringing!");

      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Exam Over!");
      lcd.setCursor(0, 1);
      lcd.print("Bell Ringing!");

      ringBell();
      examBellRang = true;
      examMode = false;
    }
  }

  delay(1000);
}

void handleButtonPress() {
  int reading = digitalRead(buttonPin);

  if (reading != lastButtonReading) {
    lastDebounceTime = millis();
    lastButtonReading = reading;
  }

  if ((millis() - lastDebounceTime) > debounceDelay) {
    if (reading == LOW && lastButtonState == HIGH) {
      buzzerManualState = !buzzerManualState;

      Serial.print("🔘 Button pressed! Buzzer state: ");
      Serial.println(buzzerManualState ? "ON" : "OFF");

      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Button Pressed");
      lcd.setCursor(0, 1);
      lcd.print(buzzerManualState ? "Buzzer ON" : "Buzzer OFF");
    }

    lastButtonState = reading;
  }
}

void ringBellContinuous() {
  digitalWrite(bellPin, HIGH);
}

void ringBell() {
  Serial.println("🔔 Ringing the bell for 5 seconds!");

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Bell Ringing!");
  lcd.setCursor(0, 1);
  lcd.print("Duration: 5s");

  digitalWrite(bellPin, HIGH);
  delay(5000);
  digitalWrite(bellPin, LOW);

  client.publish(topic_ring_status, "Bell rang at scheduled/emergency time");
}

void displayTime() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Time Sync Fail");
    return;
  }

  char timeStr[16];
  strftime(timeStr, sizeof(timeStr), "%H:%M:%S", &timeinfo);

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Time:");
  lcd.setCursor(6, 0);
  lcd.print(timeStr);

  lcd.setCursor(0, 1);
  lcd.print("Bell Ready");
}

void callback(char* topic, byte* payload, unsigned int length) {
  payload[length] = '\0';
  String message = String((char*)payload);

  Serial.printf("Message received [%s]: %s\n", topic, message.c_str());

  if (String(topic) == topic_schedule) {
    scheduledTime = message;
    bellRang = false;

    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Schedule Updated");
    lcd.setCursor(0, 1);
    lcd.print(scheduledTime);

    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, message);

    if (error) {
      Serial.printf("❌ JSON parsing failed: %s\n", error.c_str());

      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("JSON Parse Err");
      return;
    }

    periodTimes[0] = doc["period1"] | "";
    periodTimes[1] = doc["period2"] | "";
    periodTimes[2] = doc["period3"] | "";
    periodTimes[3] = doc["teaBreak"] | "";
    periodTimes[4] = doc["period4"] | "";
    periodTimes[5] = doc["period5"] | "";
    periodTimes[6] = doc["lunchBreak"] | "";
    periodTimes[7] = doc["period6"] | "";
    periodTimes[8] = doc["period7"] | "";
    periodTimes[9] = doc["period8"] | "";
    periodTimes[10] = doc["collegeEnd"] | "";

    for (int i = 0; i < 11; i++) {
      Serial.printf("Slot %d: %s\n", i + 1, periodTimes[i].c_str());
      periodRang[i] = false;
    }

    int examHours = doc["examHours"] | 0;
    int examMinutes = doc["examMinutes"] | 0;

    if (examHours > 0 || examMinutes > 0) {
      time_t now;
      time(&now);

      examEndEpoch = now + (examHours * 3600) + (examMinutes * 60);
      examMode = true;
      examBellRang = false;

      Serial.printf("✅ Exam Timer Set! Ends at epoch: %lu\n", examEndEpoch);

      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Exam Started");
      lcd.setCursor(0, 1);
      lcd.printf("Dur: %dh %dm", examHours, examMinutes);
    }
  }

  if (String(topic) == topic_emergency) {
    Serial.println("🚨 Emergency Bell Triggered!");

    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("EMERGENCY!");
    lcd.setCursor(0, 1);
    lcd.print("Bell Ringing!");

   digitalWrite(bellPin, HIGH);
  delay(5000);
  digitalWrite(bellPin, LOW);

    // Optional: timeout logic can be added to auto-stop emergency mode
  }
}

void connectWiFi() {
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Connecting WiFi");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\n✅ WiFi connected!");

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("WiFi Connected!");
}

void reconnect() {
  while (!client.connected()) {
    Serial.println("Connecting to MQTT...");

    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Connecting MQTT");

    if (client.connect("ESP32ClientUnique123")) {
      Serial.println("✅ MQTT connected");

      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("MQTT Connected!");

      client.subscribe(topic_schedule);
      client.subscribe(topic_emergency);
    } else {
      Serial.printf("❌ MQTT failed, rc=%d, retrying in 5s...\n", client.state());

      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("MQTT Failed!");
      lcd.setCursor(0, 1);
      lcd.print("Retry 5s");

      delay(5000);
    }
  }
}