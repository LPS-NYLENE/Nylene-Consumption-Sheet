# How to Use the Nylene Consumption Sheet

This guide is for people who enter consumption data on a company computer.
You only need a web browser. Do not install the app on your station.

All stations share the same application and the same Excel workbook. A save
you make on one computer will show up for the other stations.

---

## Before you start

1. Confirm you are on the **company network** (not guest Wi-Fi or a phone hotspot).
2. Open a browser (Chrome, Edge, or similar).
3. In the address bar, type the intranet address for this plant, for example:

```text
http://192.168.x.x:3000
```

Use the address your supervisor or IT gave you. It may also be a name such as:

```text
http://consumption.nylene.local:3000
```

4. You should see **Nylene Consumption Sheet** with two buttons at the top:
   **New Entry** and **Recent Entries**.

If the page does not load, stay on the company network and ask the person who
runs the server to confirm it is started.

---

## Enter a consumption record

### Step 1 — Open New Entry

Click **New Entry** if you are not already on that page.

### Step 2 — Choose the chip type

Click one of the three buttons:

| Button | When to use it | What you enter next |
| --- | --- | --- |
| **Box Number** | The chip is in a numbered box | Type the box number (letters and numbers only), for example `AD1620301` |
| **Bulk/Silo** | The chip is from a bulk or silo | Choose **A-Bulk**, **B-Bulk**, or **C-Bulk** |
| **Purchased Chip** | The chip was purchased | Choose **BASF**, **AdvanSix**, or **MOHAWK** |

Only one chip type can be selected. The extra field appears after you click a
button.

### Step 3 — Choose the product

Open the **Product** list and select the product.

If you chose **Purchased Chip**, the product is set to **Purchased** for you.
You do not pick a product in that case.

### Step 4 — Enter the net weight

In **Net Weight(lbs).**, type the weight in pounds. Use numbers only, for
example `25.5`. The weight must be greater than zero.

### Step 5 — Enter your name

In **Operator Name**, type your **first and last name**, for example
`Maya Patel`. A first name alone is not enough.

### Step 6 — Go to the destination page

Click **Next**.

If something is missing, a red message appears under the form. Fix that field
and click **Next** again.

### Step 7 — Choose the chip destination

Select **one** destination:

- DCA
- DCB
- PCH | DCA Silo
- Coperion
- Dryer
- Silo
- Recovery
- Reposting

Then click **Save**.

### Step 8 — Review the summary

Check these fields:

- Box Number (or the bulk / purchased value you chose)
- Product
- Net Weight (lbs)
- Chip Destination
- Name of Operator
- Date & Time

If something is wrong, click **Go back**, change the destination, and continue.
To start the whole entry over, click **New Entry** at the top.

### Step 9 — Save the record

Click the blue **Save** button.

- A message should say the record was saved.
- After about 3 seconds the app returns to **New Entry** so you can enter the
  next record.

If a message says to close the Excel workbook, your record is still saved.
Someone with the Excel file open on the server should close and reopen it to
see the new row in Excel. You can keep entering records.

---

## Check that the save went through

1. Click **Recent Entries**.
2. Confirm your row is at or near the top (newest first).
3. Confirm the box number, product, weight, destination, and your name.

This list is shared. Rows entered on other stations appear here too. The list
refreshes on its own every few seconds.

Click **New Entry** when you are ready to add another record.

---

## Practice example (trainer)

Walk a new user through this sample:

1. Open the intranet address.
2. Click **Box Number**.
3. Box Number: `AD1620301`
4. Product: `CSDN-INT`
5. Net Weight: `25.5`
6. Operator Name: their first and last name
7. Click **Next**.
8. Select **DCA**.
9. Click **Save**.
10. On Summary, confirm the values, then click **Save**.
11. Open **Recent Entries** and find that row.

---

## Common problems

**The page will not open**

- Use the company network.
- Do not use `http://localhost:3000` on a station computer. That only works on
  the server.
- Ask IT or the server operator to confirm the app is running.

**A red message appears on New Entry**

- Chip type: you must click Box Number, Bulk/Silo, or Purchased Chip.
- Box number: letters and numbers only; no spaces or symbols.
- Bulk/Silo or Purchased Chip: pick an option from the list.
- Product: pick a product unless Purchased Chip is selected.
- Net weight: a number greater than 0.
- Operator name: first name and last name.

**A red message appears on Chip Destination**

Select one destination before clicking Save.

**Save failed. Please try again.**

Wait a moment and click **Save** again. If it still fails, tell the server
operator. Do not assume the row was stored until you see it under
**Recent Entries**.

**I do not see my row in Excel**

Look in **Recent Entries** first. If it is there, the app saved it. If Excel
is open on the server, close the file and open it again.

**Two people are using the same computer**

Finish and save your record before the next person starts. Each browser tab
keeps its own in-progress form.

---

## What you should not do

- Do not install Node.js or copy the project folder onto every station.
- Do not start a second copy of the app on your own PC.
- Do not save from a computer that is off the company network.
- Do not edit the shared Excel file while people are entering data unless you
  know it may delay the file update. Station saves still work.

---

## Need the server started?

Operators do not start the app. IT or the assigned server/VM operator does that
with `npm start` or `start-intranet.bat`. Technical setup is in [README.md](README.md).
