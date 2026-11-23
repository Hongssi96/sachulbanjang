"""Run against disposable local development data, never a production server.

Uses the backend development environment's httpx installation. Credentials must
be supplied in IMLEADER_TEST_USER and IMLEADER_TEST_PASSWORD, not committed here.
"""
import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import httpx


def run(origin: str) -> None:
    with httpx.Client(base_url=f"{origin}/api/v1", timeout=20) as client:
        def request(method, path, body=None, expected=200):
            headers = {}
            if method != "GET":
                token = client.cookies.get("imleader_csrf_token")
                if token:
                    headers["X-CSRF-Token"] = token
            response = client.request(method, path, json=body, headers=headers)
            assert response.status_code == expected, (path, response.status_code, response.text)
            return response.json() if response.content else None

        login = request("POST", "/auth/login", {
            "employee_no": os.environ["IMLEADER_TEST_USER"],
            "password": os.environ["IMLEADER_TEST_PASSWORD"],
        })
        assert login["role"] == "admin", "Use a disposable local administrator."
        assert request("GET", "/auth/me")["id"] == login["id"]
        for path in ["/equipment", "/products", "/assignments/me", "/process/current", "/process-records", "/inspection-records", "/stocks", "/stock-movements", "/quality/summary", "/reports", "/schedules", "/handover-notes", "/work-session"]:
            request("GET", path)
        tag = f"local-api-check-{uuid4().hex[:8]}"
        report = request("POST", "/reports", {"title": tag, "body_markdown": "API integration check", "category": "equipment_issue", "report_kind": "general"}, 201)
        report_id = report["report_id"]
        assert any(row["report_id"] == report_id for row in request("GET", f"/reports?q={tag}")["items"])
        request("PATCH", f"/reports/{report_id}/status", {"version": report["version"], "business_status": "completed"})
        stale = client.patch(f"/reports/{report_id}/status", json={"version": report["version"], "business_status": "pending"}, headers={"X-CSRF-Token": client.cookies.get("imleader_csrf_token")})
        assert stale.status_code == 409
        latest = request("GET", f"/reports/{report_id}")
        request("DELETE", f"/reports/{report_id}?expected_version={latest['version']}", expected=204)
        start = datetime.now(timezone.utc) + timedelta(hours=1)
        schedule = request("POST", "/schedules", {"title": tag, "description": "API check", "category": "inspection", "all_day": False, "starts_at": start.isoformat(), "ends_at": (start + timedelta(hours=1)).isoformat()}, 201)
        request("GET", f"/schedules/{schedule['schedule_id']}")
        request("DELETE", f"/schedules/{schedule['schedule_id']}?expected_version={schedule['version']}", expected=204)
        note = request("POST", "/handover-notes", {"body": tag, "targets": []}, 201)
        request("PUT", f"/handover-notes/{note['note_id']}/confirmation")
        assert request("GET", f"/handover-notes/{note['note_id']}")["my_confirmed_at"]
        request("DELETE", f"/handover-notes/{note['note_id']}?expected_version={note['version']}", expected=204)
        products = request("GET", "/products")["items"]
        if products:
            product_id = products[0]["product_id"]
            before = next(row["quantity"] for row in request("GET", "/stocks")["items"] if row["product_id"] == product_id)
            receipt = request("POST", "/stock-movements", {"product_id": product_id, "kind": "receipt", "quantity": 1, "reason": tag}, 201)
            assert receipt["quantity_after"] == before + 1
            issue = request("POST", "/stock-movements", {"product_id": product_id, "kind": "issue", "quantity": 1, "reason": tag}, 201)
            assert issue["quantity_after"] == before
        no_csrf = client.post("/reports", json={"title": tag, "body_markdown": tag, "category": "other"})
        assert no_csrf.status_code == 403
        original_password = os.environ["IMLEADER_TEST_PASSWORD"]
        changed_password = f"LocalCheck-{uuid4().hex}!"
        request("PATCH", "/auth/password", {"current_password": original_password, "new_password": changed_password})
        request("PATCH", "/auth/password", {"current_password": changed_password, "new_password": original_password})
        work_session = request("GET", "/work-session")
        extended = request("POST", "/work-session/extensions", {"kind": "manual", "expected_ends_at": work_session["ends_at"]})
        assert extended["ends_at"] > work_session["ends_at"]
        request("POST", "/auth/logout", expected=204)
        assert client.get("/auth/me").status_code == 401
        print(f"PASS {origin}: read endpoints, report status/conflict/delete, schedule, handover confirmation, stock receipt/issue, password change/restore, work extension, CSRF, logout")


if __name__ == "__main__":
    for url in ["http://127.0.0.1:5174", "http://127.0.0.1:5175"]:
        run(url)
