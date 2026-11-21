"""Generate idempotent SQL for the one-time Shopee Lin workbook migration."""
import sys
import uuid
from datetime import date, datetime

import openpyxl

NAMESPACE = uuid.UUID("465f1fa8-9c3e-4fb2-a43a-ea421bc1083a")
EXPECTED_DEBT = 2_999_619
EXPECTED_INSTALLMENT_REMAINING = 18_000_000


def q(value):
    return "'" + str(value).replace("'", "''") + "'"


def parse_date(value, sheet, may=False):
    if may:
        return date(2026, 5, 18)
    if isinstance(value, datetime):
        # Excel parsed these source dd/mm strings as US mm/dd dates.
        return date(value.year, value.day, value.month)
    for fmt in ("%d/%m/%Y", "%d/%m/%y", "%d/%m/%Y "):
        try:
            return datetime.strptime(str(value).strip(), fmt).date()
        except ValueError:
            pass
    raise ValueError(f"Unrecognized date {value!r} in sheet {sheet}")


def cycle_for(day):
    if day <= date(2026, 5, 18):
        return "05.2026"
    if day <= date(2026, 6, 20):
        return "06.2026"
    month = day.month + 1 if day.day >= 21 else day.month
    return f"{month:02d}.2026"


def stable_id(kind, *parts):
    return str(uuid.uuid5(NAMESPACE, "|".join([kind, *map(str, parts)])))


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python scripts/import_legacy.py <workbook.xlsx>")
    workbook = openpyxl.load_workbook(sys.argv[1], data_only=True)
    orders, payments = [], []
    for sheet in workbook.worksheets:
        if sheet.title == "Góp S25U":
            continue
        is_may = sheet.title == "05.2026"
        amount_col, desc_col = (3, 2) if is_may else (4, 3)
        for row in range(1, sheet.max_row + 1):
            seq = sheet.cell(row, 1).value
            amount = sheet.cell(row, amount_col).value
            desc = sheet.cell(row, desc_col).value
            if not isinstance(seq, (int, float)) or not isinstance(amount, (int, float)) or not desc:
                continue
            when = parse_date(None if is_may else sheet.cell(row, 2).value, sheet.title, is_may)
            record = {"date": when, "description": " ".join(str(desc).split()), "amount": abs(int(amount)), "source": sheet.title}
            (orders if amount < 0 else payments).append(record)

    # Opening credit is a ledger item, not a fake purchase. It offsets the old
    # orders and the recorded transfers exactly to the Excel ending balance.
    opening = {"date": date(2026, 5, 18), "description": "Số dư đầu kỳ theo Excel", "amount": 5_000_000, "source": "opening-credit"}
    adjustments = []

    payments.sort(key=lambda p: (p["date"], p["description"]))
    orders.sort(key=lambda o: (o["date"], o["source"], o["description"]))
    total_orders = sum(o["amount"] for o in orders)
    total_paid = sum(p["amount"] for p in payments)
    # Excel opening carry at the start of 11.2026 is zero. The current period's
    # purchases are the exact outstanding amount; prior payments net prior cycles.
    current_orders = sum(o["amount"] for o in orders if o["source"] == "11.2026")
    reconciled = total_orders - opening["amount"] - total_paid
    if current_orders != EXPECTED_DEBT or reconciled != EXPECTED_DEBT:
        raise ValueError(f"Shopee reconciliation mismatch: current={current_orders:,}, derived={reconciled:,}, expected={EXPECTED_DEBT:,}")

    plan = workbook["Góp S25U"]
    installment_total = int(plan["B3"].value)
    installments = []
    for row in range(8, plan.max_row + 1):
        paid_at, amount = plan.cell(row, 2).value, plan.cell(row, 3).value
        if paid_at and isinstance(amount, (int, float)) and amount > 0:
            installments.append((parse_date(paid_at, plan.title), int(amount)))
    installment_paid = sum(amount for _, amount in installments)
    installment_remaining = installment_total - installment_paid
    if installment_remaining != EXPECTED_INSTALLMENT_REMAINING:
        raise ValueError(f"S25U reconciliation mismatch: {installment_remaining:,}")

    cycles = [
        ("05.2026", date(2026, 5, 1), date(2026, 5, 18)),
        ("06.2026", date(2026, 5, 19), date(2026, 6, 20)),
        ("07.2026", date(2026, 6, 21), date(2026, 7, 20)),
        ("08.2026", date(2026, 7, 21), date(2026, 8, 20)),
        ("09.2026", date(2026, 8, 21), date(2026, 9, 20)),
        ("10.2026", date(2026, 9, 21), date(2026, 10, 20)),
        ("11.2026", date(2026, 10, 21), date(2026, 11, 20)),
    ]
    cycle_openings = {"05.2026": 0, "06.2026": -1_596_780, "07.2026": -1_265_880, "08.2026": 17_448, "09.2026": 0, "10.2026": 3_478_930, "11.2026": 0}
    print("begin;")
    print("insert into public.billing_cycles (label, starts_on, ends_on, opening_balance) values")
    print(",\n".join(f"  ({q(label)}, '{start}', '{end}', {cycle_openings[label]})" for label, start, end in cycles))
    print("on conflict (label) do nothing;")
    all_orders = orders
    order_ids = {}
    print("insert into public.orders (id,billing_cycle_id,placed_at,description,amount,status) select v.id::uuid,c.id,v.placed_at::date,v.description,v.amount,'unpaid'::public.order_status from (values")
    order_rows = []
    for index, order in enumerate(all_orders):
        oid = stable_id("order", index, order["date"], order["description"], order["amount"])
        order_ids[index] = oid
        label = order["source"] if order["source"] == "05.2026" else cycle_for(order["date"])
        order_rows.append(f"  ('{oid}',{q(label)},'{order['date']}',{q(order['description'])},{order['amount']})")
    print(",\n".join(order_rows))
    print(") v(id,cycle_label,placed_at,description,amount) join public.billing_cycles c on c.label=v.cycle_label on conflict (id) do nothing;")

    for entry in [opening, *adjustments]:
        eid = stable_id("ledger-entry", entry["source"], entry["date"], entry["amount"])
        kind = "opening_credit" if entry["source"] == "opening-credit" else "legacy_adjustment"
        cycle_label = cycle_for(entry["date"])
        # Ledger amounts use signed balance convention: positive is credit, negative is debt.
        signed_amount = -entry["amount"] if kind == "opening_credit" else entry["amount"]
        print(f"insert into public.ledger_entries (id,billing_cycle_id,entry_date,kind,amount,description) select '{eid}',id,'{entry['date']}','{kind}'::public.ledger_entry_kind,{signed_amount},{q(entry['description'])} from public.billing_cycles where label={q(cycle_label)} on conflict (id) do nothing;")

    payment_rows = []
    for index, payment in enumerate(payments):
        pid = stable_id("payment", index, payment["date"], payment["description"], payment["amount"])
        payment["id"] = pid
        payment_rows.append(f"  ('{pid}','{payment['date']}',{payment['amount']},{q(payment['description'])})")
    print("insert into public.payments (id,paid_at,amount,note) values")
    print(",\n".join(payment_rows))
    print("on conflict (id) do nothing;")

    # Historical payments are fully allocated to oldest outstanding purchase rows.
    remaining = [order["amount"] for order in orders]
    allocations = []
    cursor = 0
    for payment in payments:
        available = payment["amount"]
        for i in range(cursor, len(orders)):
            if orders[i]["date"] > payment["date"]:
                break
            used = min(available, remaining[i])
            if used:
                allocations.append((payment["id"], order_ids[i], used))
                remaining[i] -= used
                available -= used
            if remaining[i] == 0:
                cursor = i + 1
            if available == 0:
                break
        if available:
            raise ValueError(f"Historical payment {payment['description']} has {available:,} VND not allocated to prior orders")
    if allocations:
        print("insert into public.payment_allocations (payment_id,order_id,amount) values")
        print(",\n".join(f"  ('{p}','{o}',{a})" for p, o, a in allocations))
        print("on conflict (payment_id,order_id) do nothing;")
    paid_ids = [oid for index, oid in order_ids.items() if index < len(orders) and remaining[index] == 0]
    if paid_ids:
        print("update public.orders set status='paid',updated_at=now() where id in (" + ",".join(q(x)+"::uuid" for x in paid_ids) + ");")

    plan_id = stable_id("plan", "Samsung Galaxy S25 Ultra")
    print(f"insert into public.installment_plans (id,name,total_amount) values ('{plan_id}','Samsung Galaxy S25 Ultra',{installment_total}) on conflict (id) do nothing;")
    for index, (paid_at, amount) in enumerate(installments):
        iid = stable_id("installment-payment", index, paid_at, amount)
        print(f"insert into public.installment_payments (id,plan_id,paid_at,amount,note) values ('{iid}','{plan_id}','{paid_at}',{amount},'Lần góp lịch sử') on conflict (id) do nothing;")
    print("commit;")
    print(f"-- Reconciled: {len(orders)} purchases={total_orders:,}; payments={total_paid:,}; opening credit={opening['amount']:,}; debt={EXPECTED_DEBT:,}; S25U={installment_total:,}, paid={installment_paid:,}, remaining={installment_remaining:,}")


if __name__ == "__main__":
    main()
