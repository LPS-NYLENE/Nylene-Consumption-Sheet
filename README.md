# Nylene Consumption Sheet

**Operators:** use [HOW_TO_USE.md](HOW_TO_USE.md) for step-by-step training on
how to enter records.

Internal web application for recording chip consumption. One company server
hosts the application and the shared Excel workbook. Workstations only need a
browser on the company network.

```text
Company stations  ->  Company intranet  ->  Internal web server
                                            |-- application pages
                                            +-- central Excel file
```

The server is the single source of truth. Stations do not install or run a
local copy of the app.

## Station access

On any authorized computer connected to the company network, open:

```text
http://SERVER-IP:3000
```

or, if IT assigned a hostname:

```text
http://consumption.nylene.local:3000
```

Replace `SERVER-IP` and `3000` with the values shown in the server window when
the app starts. Example: `http://192.168.10.21:3000`.

No project folder, Node.js install, or Live Server is required on workstations.

## Server setup (one computer)

Do this once on the designated intranet host.

1. Install [Node.js LTS](https://nodejs.org/).
2. Copy this project folder onto that computer.
3. Double-click `start-intranet.bat`, or from the project folder run:

```bat
npm install
npm start
```

4. Confirm the console prints an intranet URL such as
   `http://192.168.x.x:3000`.
5. Open that URL from the server and from another station on the LAN.
6. Allow inbound TCP on the chosen port in Windows Firewall for **Private**
   networks only. Do not forward this port through the public firewall or VPN
   edge unless IT explicitly intends to.

Keep the server process running while stations are using the app. Closing the
window stops the application for every station.

## Shared data

Saved rows are written to one Excel workbook on the server:

```text
data\consumption-sheet.xlsx
```

To keep using an existing workbook, set `EXCEL_FILE_PATH` before starting:

```bat
set EXCEL_FILE_PATH=G:\Installed Software\1 Temp\1 Temp\Cool Room Consumption Folder\Nylene consumption sheet.xlsx
npm start
```

Every station posts to the same `/save` endpoint, so a save from one computer
is stored in that workbook and appears under **Recent Entries** on the other
stations.

You can open the workbook in Excel to view it. If Excel has the file open,
Windows locks it and the app cannot rewrite the `.xlsx` until it is closed.
Saves still succeed: they are kept in a `.ledger.json` file next to the
workbook and written into Excel automatically after the file is closed.
Re-open the workbook (or refresh) to see the newest rows.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Listen on all network interfaces so LAN stations can connect. Use `127.0.0.1` for this computer only. |
| `PORT` | `3000` | HTTP port. |
| `EXCEL_FILE_PATH` | `data/consumption-sheet.xlsx` | Central workbook on the server. |
| `ALLOW_PUBLIC` | `false` | When false, clients on public internet IPs receive 403. Set `true` only if IT has another control in front of the app. |
| `CORS_ORIGIN` | unset | Not needed for normal intranet use. Set only if a separate origin must call the API. |

The app is not published to the public internet. Keep it on the company LAN.
IT would have to change firewall or `ALLOW_PUBLIC` settings to expose it.

## Daily use

1. Start the server on the designated computer (`start-intranet.bat` or `npm start`).
2. On each station, open the intranet URL in a browser.
3. Submit entries as usual. **Recent Entries** refreshes automatically so other
   stations can see new rows.

Optional: create a Windows Task Scheduler job that runs `start-intranet.bat` at
startup so the app comes back after a reboot.

## Troubleshooting

**A station cannot open the URL**

- Confirm the server window is still running.
- Confirm the station is on the company network, not a guest/public Wi-Fi.
- Try the server computer's IP from `ipconfig` (`IPv4 Address`).
- Confirm Windows Firewall allows inbound TCP on the port for private networks.

**Save fails**

- Confirm the Excel path printed at startup exists and is writable.
- Confirm two stations are not pointing at two different servers.
- If Excel is open, the app should still save. Close and reopen the workbook
  to see new rows. Check the server window for a message that the file is locked.

**Port already in use**

```bat
set PORT=8080
npm start
```

Stations must then use `http://SERVER-IP:8080`.
