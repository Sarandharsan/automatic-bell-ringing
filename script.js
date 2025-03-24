// Schedule for index.html with inferred end times
const schedule = [
    { name: "Period 1", start: "07:40", end: "08:30" },
    { name: "Period 2", start: "08:30", end: "09:20" },
    { name: "Period 3", start: "09:20", end: "10:10" },
    { name: "Tea Break", start: "10:10", end: "10:25" },
    { name: "Period 4", start: "10:25", end: "11:25" },
    { name: "Period 5", start: "11:25", end: "12:20" },
    { name: "Lunch Break", start: "12:20", end: "12:55" },
    { name: "Period 6", start: "12:55", end: "13:30" },
    { name: "Period 7", start: "13:30", end: "14:10" },
    { name: "Period 8", start: "14:10", end: "14:45" },
    { name: "College Closed", start: "14:45", end: "23:59" }
];

// Function to get IST time
function getISTTime() {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const istOffset = 5.5 * 60 * 60 * 1000;
    return new Date(utc + istOffset);
}

// Function to format time as HH:MM:SS AM/PM
function formatTime(date) {
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const seconds = date.getSeconds().toString().padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return `${hours}:${minutes}:${seconds} ${ampm}`;
}

// Function to format timer as HH:MM:SS
function formatTimer(seconds) {
    const hrs = Math.floor(seconds / 3600).toString().padStart(2, "0");
    const mins = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
    const secs = (seconds % 60).toString().padStart(2, "0");
    return `${hrs}:${mins}:${secs}`;
}

// Function to get current period and ring bell on transition
let lastPeriod = null;
function getCurrentPeriod() {
    const now = getISTTime();
    const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    for (let period of schedule) {
        if (currentTime >= period.start && currentTime < period.end) {
            if (lastPeriod !== period.name) {
                lastPeriod = period.name;
                ringBell();
            }
            return period;
        }
    }
    if (lastPeriod !== "Before College Hours") {
        lastPeriod = "Before College Hours";
        ringBell();
    }
    return { name: "Before College Hours", start: "00:00", end: "07:40" };
}

// Calculate progress percentage (reverse) for periods
function calculatePeriodProgress(period) {
    const now = getISTTime();
    const [startHours, startMinutes] = period.start.split(":").map(Number);
    const [endHours, endMinutes] = period.end.split(":").map(Number);

    const startTime = new Date(now);
    startTime.setHours(startHours, startMinutes, 0, 0);

    const endTime = new Date(now);
    endTime.setHours(endHours, endMinutes, 0, 0);

    const totalDuration = (endTime - startTime) / 1000;
    const elapsedTime = (now - startTime) / 1000;
    const remainingPercentage = Math.max(0, ((totalDuration - elapsedTime) / totalDuration) * 100);

    return remainingPercentage;
}

// Calculate progress percentage (reverse) for exam timer
function calculateExamProgress(totalSeconds, remainingSeconds) {
    return Math.max(0, (remainingSeconds / totalSeconds) * 100);
}

// Update dashboard (index.html)
function updateDashboard() {
    const currentTimeElement = document.getElementById("current-time");
    const currentPeriodElement = document.getElementById("current-period");
    const periodLabelElement = document.getElementById("period-label");
    const progressBarElement = document.getElementById("period-progress");

    if (currentTimeElement && currentPeriodElement && periodLabelElement && progressBarElement) {
        const istTime = getISTTime();
        currentTimeElement.textContent = formatTime(istTime);

        const examActive = localStorage.getItem("examActive") === "true";
        const examTime = parseInt(localStorage.getItem("examTimeRemaining")) || 0;
        const totalExamTime = parseInt(localStorage.getItem("totalExamTime")) || 0;

        if (examActive && examTime > 0) {
            periodLabelElement.textContent = "Exam Time Remaining";
            currentPeriodElement.textContent = formatTimer(examTime);
            const examProgress = calculateExamProgress(totalExamTime, examTime);
            progressBarElement.style.width = `${examProgress}%`;
        } else {
            periodLabelElement.textContent = "Current Period";
            const currentPeriod = getCurrentPeriod();
            currentPeriodElement.textContent = currentPeriod.name;
            const periodProgress = calculatePeriodProgress(currentPeriod);
            progressBarElement.style.width = `${periodProgress}%`;
            if (!examActive) {
                localStorage.setItem("examActive", "false");
                localStorage.setItem("examTimeRemaining", "0");
                localStorage.setItem("totalExamTime", "0");
            }
        }
    }
}

// Exam timer logic
function startExamTimer() {
    const hours = parseInt(document.getElementById("exam-hours").value) || 0;
    const minutes = parseInt(document.getElementById("exam-minutes").value) || 0;
    const seconds = parseInt(document.getElementById("exam-seconds").value) || 0;

    const totalSeconds = (hours * 3600) + (minutes * 60) + seconds;

    if (totalSeconds <= 0) {
        localStorage.setItem("examActive", "false");
        localStorage.setItem("examTimeRemaining", "0");
        localStorage.setItem("totalExamTime", "0");
        localStorage.setItem("isThreeHourExam", "false");
        updateExamPage();
        return;
    }

    localStorage.setItem("examActive", "true");
    localStorage.setItem("examTimeRemaining", totalSeconds);
    localStorage.setItem("totalExamTime", totalSeconds);
    localStorage.setItem("isThreeHourExam", "false");
}

// Set 3-hour timer with bells
function setThreeHourTimer() {
    document.getElementById("exam-hours").value = 3;
    document.getElementById("exam-minutes").value = 0;
    document.getElementById("exam-seconds").value = 0;

    const totalSeconds = 3 * 3600;
    localStorage.setItem("examActive", "true");
    localStorage.setItem("examTimeRemaining", totalSeconds);
    localStorage.setItem("totalExamTime", totalSeconds);
    localStorage.setItem("isThreeHourExam", "true");
    localStorage.setItem("bellStates", JSON.stringify({
        start: false,
        oneHour: false,
        twoHours: false,
        last30Mins: false,
        last10Mins: false,
        end: false
    }));
    alert("1st Bell: Exam Start");
    ringBell();
}

// Update exam page (exam.html)
function updateExamPage() {
    const currentTimeElement = document.getElementById("current-time");
    const examTimerElement = document.getElementById("exam-timer");
    const examProgressElement = document.getElementById("exam-progress");

    if (currentTimeElement) {
        const istTime = getISTTime();
        currentTimeElement.textContent = formatTime(istTime);
    }

    if (examTimerElement && examProgressElement) {
        const examActive = localStorage.getItem("examActive") === "true";
        const examTime = parseInt(localStorage.getItem("examTimeRemaining")) || 0;
        const totalExamTime = parseInt(localStorage.getItem("totalExamTime")) || 0;

        examTimerElement.textContent = examActive ? formatTimer(examTime) : "00:00:00";
        const examProgress = examActive ? calculateExamProgress(totalExamTime, examTime) : 0;
        examProgressElement.style.width = `${examProgress}%`;
    }
}

// Global timer countdown with bell system and buzzer
function updateExamTimer() {
    const examActive = localStorage.getItem("examActive") === "true";
    const isThreeHourExam = localStorage.getItem("isThreeHourExam") === "true";
    let examTime = parseInt(localStorage.getItem("examTimeRemaining")) || 0;
    let bellStates = JSON.parse(localStorage.getItem("bellStates")) || {
        start: false,
        oneHour: false,
        twoHours: false,
        last30Mins: false,
        last10Mins: false,
        end: false
    };

    if (examActive && examTime > 0) {
        examTime--;
        localStorage.setItem("examTimeRemaining", examTime);

        if (isThreeHourExam) {
            const totalExamTime = parseInt(localStorage.getItem("totalExamTime")) || 10800;
            const elapsedTime = totalExamTime - examTime;

            if (elapsedTime === 0 && !bellStates.start) {
                bellStates.start = true;
            } else if (examTime === 7200 && !bellStates.oneHour) {
                alert("2nd Bell: 1 Hour Over");
                ringBell();
                bellStates.oneHour = true;
            } else if (examTime === 3600 && !bellStates.twoHours) {
                alert("3rd Bell: 2 Hours Over");
                ringBell();
                bellStates.twoHours = true;
            } else if (examTime === 1800 && !bellStates.last30Mins) {
                alert("4th Bell: Last 30 Minutes");
                ringBell();
                bellStates.last30Mins = true;
            } else if (examTime === 600 && !bellStates.last10Mins) {
                alert("5th Bell: Last 10 Minutes (Warning Bell)");
                ringBell();
                bellStates.last10Mins = true;
            }

            localStorage.setItem("bellStates", JSON.stringify(bellStates));
        }

        if (examTime <= 0) {
            if (isThreeHourExam && !bellStates.end) {
                alert("6th Bell: Exam Over");
                ringBell();
                bellStates.end = true;
                localStorage.setItem("bellStates", JSON.stringify(bellStates));
            }
            localStorage.setItem("examActive", "false");
            localStorage.setItem("examTimeRemaining", "0");
            localStorage.setItem("totalExamTime", "0");
            localStorage.setItem("isThreeHourExam", "false");
        }
    }
}

// Event listeners
document.addEventListener("DOMContentLoaded", () => {
    console.log("Page loaded");

    const startBtn = document.querySelector(".start-exam-btn");
    if (startBtn) {
        startBtn.addEventListener("click", startExamTimer);
    }

    const emergencyBellBtn = document.getElementById("emergency-bell");
    if (emergencyBellBtn) {
        emergencyBellBtn.addEventListener("click", () => {
            alert("Emergency Bell is Ringing!");
            console.log("Emergency button clicked");
            ringBell(); // Connects on first click, no popup on subsequent clicks if connected
        });
    }

    const threeHourBtn = document.getElementById("three-hour-timer");
    if (threeHourBtn) {
        threeHourBtn.addEventListener("click", setThreeHourTimer);
    }

    updateDashboard();
    updateExamPage();
});

// Run updates every second
setInterval(() => {
    updateDashboard();
    updateExamPage();
    updateExamTimer();
}, 1000);