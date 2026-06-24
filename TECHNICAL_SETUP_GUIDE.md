# Nylene Consumption Sheet App - Technical Setup Guide

## 1. Purpose of the App

The Nylene Consumption Sheet app is a local web application used to collect
field entries and save them into an Excel workbook on the office computer.

The app is not deployed to a public domain because the data is meant to stay on
the office computer or office network location.

## 2. How the App Works

The app has two main parts:

1. **Frontend**
   - Built with HTML, CSS, and JavaScript.
   - Opened in a browser from VS Code, usually with Live Server.
   - Allows the user to enter box number, product, operator name, destination,
     and net weight.

2. **Backend**
   - Built with Node.js and Express.
   - Runs locally from the VS Code terminal.
   - Receives the form data from the frontend.
   - Uses the `xlsx` package to write the submitted data into an Excel file.

Basic flow:

```text
User opens frontend in browser
        |
        | submits form data
        v
Local Node.js backend
        |
        | writes a new row
        v
Excel workbook on the office computer or network drive
```

## 3. Required Software

Install the following on the office computer:

### 3.1 Visual Studio Code

Download and install VS Code from:

```text
https://code.visualstudio.com/
```

VS Code is used to open the project folder and run the local terminal commands.

### 3.2 Node.js and npm

Download and install the current LTS version of Node.js from:

```text
https://nodejs.org/
```

`npm` is installed together with Node.js. It is used to install the backend
packages.

To confirm installation, open a terminal and run:

```bash
node -v
npm -v
```

Both commands should print version numbers.

### 3.3 VS Code Live Server Extension

In VS Code:

1. Open **Extensions**.
2. Search for **Live Server**.
3. Install **Live Server**.

Live Server is used to open the frontend pages in the browser during local use.

### 3.4 Microsoft Excel

Install Microsoft Excel or another program that can open `.xlsx` files.

Excel is used to view the saved consumption sheet.

## 4. Project Files

Important files in this project:

```text
index.html          Main frontend page
destination.html    Destination selection page
summary.html        Summary and save page
app.js              Frontend JavaScript
style.css           App styling
server.cjs          Local Node.js backend
package.json        npm scripts and package list
package-lock.json   Locked npm dependency versions
```

The backend dependencies are listed in `package.json`:

```text
express
cors
xlsx
```

Package purpose:

- `express`: creates the local backend server.
- `cors`: allows the frontend and backend to communicate when they run on
  different local ports.
- `xlsx`: reads, creates, and writes the Excel workbook.

## 5. First-Time Setup

Internet access is needed during first-time setup so npm can download the
required packages.

1. Open VS Code.
2. Click **File > Open Folder**.
3. Select the app project folder.
4. Open the VS Code terminal:
   - **Terminal > New Terminal**
5. Install the npm packages:

```bash
npm install
```

This command reads `package.json` and installs `express`, `cors`, `xlsx`, and
their required dependencies.

## 6. Excel File Location

The backend saves submitted rows to an Excel workbook.

On Windows, the default save path in the backend is:

```text
Z:\Nylene consumption sheet.xlsx
```

This means the app expects a `Z:` drive or network drive to be available on the
office computer.

If IT wants to save to a different location, start the backend with the
`EXCEL_FILE_PATH` environment variable.

Example using PowerShell:

```powershell
$env:EXCEL_FILE_PATH="C:\Users\OfficeUser\Desktop\Nylene consumption sheet.xlsx"
npm start
```

Example using Command Prompt:

```cmd
set EXCEL_FILE_PATH=C:\Users\OfficeUser\Desktop\Nylene consumption sheet.xlsx && npm start
```

If the Excel file does not already exist, the backend creates it. If it already
exists, the backend appends a new row to `Sheet1`.

## 7. How to Run the App

The backend must be running before saving data to Excel.

### Step 1: Open the project in VS Code

1. Open VS Code.
2. Click **File > Open Folder**.
3. Select the app project folder.

### Step 2: Start the backend

Open the VS Code terminal and run:

```bash
npm start
```

This runs:

```bash
node server.cjs
```

Expected terminal output:

```text
Server running at http://localhost:3000
Excel file path: ...
```

Keep this terminal open while using the app. If the terminal is closed, the
backend stops and the app cannot save to Excel.

### Step 3: Open the frontend with Live Server

1. In VS Code, open or locate `index.html`.
2. Right-click `index.html`.
3. Click **Open with Live Server**.
4. The browser should open the local frontend.

The frontend sends saved entries to:

```text
http://localhost:3000/save
```

Because the backend uses `cors`, the Live Server frontend can communicate with
the backend even if Live Server uses a different local port.

### Alternative: Open directly from the backend

The backend can also serve the frontend directly. After running `npm start`,
open this URL in the browser:

```text
http://localhost:3000
```

This option does not require Live Server.

## 8. How Data Is Saved to Excel

When the user clicks save:

1. The frontend gathers the form data.
2. The frontend sends a `POST` request to the local backend endpoint:

```text
http://localhost:3000/save
```

3. The backend validates the required fields.
4. The backend adds the current date and time.
5. The backend opens or creates the Excel workbook.
6. The backend appends a new row to `Sheet1`.
7. The backend writes the workbook back to disk.

The Excel columns are:

```text
Box Number
Product
Operator Name
Chip Destination
Date
Time
Net Weight
```

## 9. Demo Steps for IT

Use these steps to demonstrate the app:

1. Open the project folder in VS Code.
2. Open the VS Code terminal.
3. Run:

```bash
npm install
npm start
```

4. Confirm the terminal shows:

```text
Server running at http://localhost:3000
```

5. Open `index.html` with Live Server.
6. Fill in a sample entry.
7. Go through the app flow until the save step.
8. Submit the entry.
9. Open the Excel workbook.
10. Confirm the new row was added to `Sheet1`.

## 10. Internet and Network Notes

The app is local and does not need to be deployed to a public domain.

Internet access is mainly required for:

- Installing Node.js.
- Installing VS Code extensions.
- Running `npm install` to download packages.

After dependencies are installed, the backend runs locally on the computer.
If the office environment requires internet every time the backend runs, IT
should confirm whether packages are missing, npm is being run before every
startup, or security software is blocking local Node.js execution.

The app also needs access to the Excel file location. If the workbook is saved
on a network drive such as `Z:`, that drive must be connected before the backend
starts.

## 11. Troubleshooting

### Backend does not start

Check that Node.js and npm are installed:

```bash
node -v
npm -v
```

Then reinstall dependencies:

```bash
npm install
```

Start again:

```bash
npm start
```

### Browser opens, but save does not work

Confirm the backend terminal is still running and shows:

```text
Server running at http://localhost:3000
```

If the backend is not running, start it with:

```bash
npm start
```

### CORS error in browser

Confirm the request is going to:

```text
http://localhost:3000/save
```

Also confirm the backend is running. The backend includes the `cors` package to
allow local frontend requests.

### Excel file is not created or updated

Check the backend terminal for the Excel file path. Confirm:

- The folder or drive exists.
- The user has permission to write to that location.
- The Excel file is not locked by another user or process.
- The `Z:` drive is connected if using the default Windows path.

### Port 3000 is already in use

Another app may already be using port `3000`.

In PowerShell, start the backend on another port:

```powershell
$env:PORT="3001"
npm start
```

If the port is changed, the frontend must also be configured to call the new
backend URL.

For example, if the backend runs on port `3001` and the frontend is opened with
Live Server, update the `summary.html` body tag:

```html
<body data-page="summary" data-api-base="http://localhost:3001">
```

The recommended setup is to keep the backend on port `3000` unless IT needs a
different port.

## 12. Operational Notes

- Keep the backend terminal open while using the app.
- Back up the Excel workbook regularly.
- Do not expose the backend publicly unless IT reviews and approves it.
- Keep the app folder in a stable location on the office computer.
- If using a network drive, confirm the drive is connected before starting the
  backend.
