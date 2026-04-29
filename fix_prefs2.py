filepath = "/home/ubuntuuser/ct-app/src/app/(dashboard)/payment-calendar/page.tsx"
with open(filepath, "r") as f:
    content = f.read()

old_block = '''  // --- Load user filter preferences from DB ---
  const prefsLoadedRef = useRef(false);
  useEffect(() => {
    if (!uid || prefsLoadedRef.current) return;
    prefsLoadedRef.current = true;
    fetch("/api/user-page-preferences?page=payment-calendar")
      .then(res => res.json())
      .then(data => {
        if (!data.config) return;
        try {
          const c = JSON.parse(data.config);
          if (c.search !== undefined) setSearch(c.search);
          if (c.branchFilter) setBranchFilter(c.branchFilter);
          if (c.paymentDate) setPaymentDate(c.paymentDate);
          if (c.dateType) setDateType(c.dateType);
          if (c.carrierFilter) setCarrierFilter(c.carrierFilter);
          console.log("[PaymentCalendar] User preferences loaded");
        } catch (e) {
          console.error("[PaymentCalendar] Failed to parse preferences:", e);
        }
      })
      .catch(err => console.error("[PaymentCalendar] Failed to load preferences:", err));
  }, [uid]);'''

new_block = '''  // --- Load user filter preferences from DB ---
  // prefsLoadedRef is set true ONLY AFTER fetch completes, preventing auto-save from overwriting with defaults
  const prefsLoadedRef = useRef(false);
  useEffect(() => {
    if (!uid || prefsLoadedRef.current) return;
    fetch("/api/user-page-preferences?page=payment-calendar")
      .then(res => res.json())
      .then(data => {
        if (data.config) {
          try {
            const c = JSON.parse(data.config);
            if (c.search !== undefined) setSearch(c.search);
            if (c.branchFilter) setBranchFilter(c.branchFilter);
            if (c.paymentDate) setPaymentDate(c.paymentDate);
            if (c.dateType) setDateType(c.dateType);
            if (c.carrierFilter) setCarrierFilter(c.carrierFilter);
            console.log("[PaymentCalendar] User preferences loaded");
          } catch (e) {
            console.error("[PaymentCalendar] Failed to parse preferences:", e);
          }
        }
        prefsLoadedRef.current = true;
      })
      .catch(err => {
        console.error("[PaymentCalendar] Failed to load preferences:", err);
        prefsLoadedRef.current = true;
      });
  }, [uid]);'''

if old_block in content:
    content = content.replace(old_block, new_block)
    with open(filepath, "w") as f:
        f.write(content)
    print("SUCCESS: fixed race condition")
else:
    print("ERROR: old block not found")
    idx = content.find("prefsLoadedRef.current = true;")
    if idx >= 0:
        print("Found at offset", idx)
        print(repr(content[idx-80:idx+80]))
    else:
        print("Already fixed?")
