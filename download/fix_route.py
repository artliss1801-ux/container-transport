import sys

filepath = "/home/ubuntuuser/ct-app/src/app/api/orders/payment-calendar/route.ts"

with open(filepath, "r") as f:
    content = f.read()

# 1. Fix the import
old_import = 'import { countRussianWorkingDays, addRussianWorkingDays, isRussianWorkingDay, ensureRussianWorkingDay, ensureProductionCalendar, clearProductionCalendarCache } from "@/lib/russian-calendar";'
new_import = 'import { countRussianWorkingDays, addRussianWorkingDays, isRussianWorkingDay, ensureRussianWorkingDay, clearProductionCalendarCache, setCalendarData } from "@/lib/russian-calendar";\nimport { loadProductionCalendarFromDB } from "@/lib/calendar-db-loader";'
content = content.replace(old_import, new_import)

# 2. Replace all ensureProductionCalendar() calls
old_call = "await ensureProductionCalendar();"
new_call = "{\n    const cy = new Date().getFullYear();\n    const calData = await loadProductionCalendarFromDB([cy - 1, cy, cy + 1]);\n    setCalendarData(calData);\n  }"

count = content.count(old_call)
print(f"Found {count} occurrences of ensureProductionCalendar()")

content = content.replace(old_call, new_call)

with open(filepath, "w") as f:
    f.write(content)

print("Updated payment-calendar/route.ts")
