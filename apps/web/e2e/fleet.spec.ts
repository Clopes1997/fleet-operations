import { test, expect } from "@playwright/test";
test("authenticated customer/order lifecycle preserves an overdue job", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill("fleet-test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("fleet-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Customers", exact: true }).click();
  const name = "Browser customer " + Date.now();
  await page.getByLabel("Display name").fill(name);
  await page
    .getByRole("button", { name: "Create customer", exact: true })
    .click();
  await expect(page.getByText(new RegExp(name))).toBeVisible();
  await page
    .getByRole("button", { name: "Service orders", exact: true })
    .click();
  await page.getByLabel("Customer snapshot").fill(name);
  await page.getByLabel("Description", { exact: true }).fill("Overdue repair");
  await page.getByLabel("Quoted amount").fill("12.34");
  await page.getByLabel("Deadline", { exact: true }).fill("2020-01-01");
  await page.getByRole("button", { name: "Create order", exact: true }).click();
  await page.getByLabel("Search orders").fill(name);
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toContainText("12.34");
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("em_andamento");
  await page.getByRole("button", { name: "Save order", exact: true }).click();
  await expect(row).toContainText("em_andamento");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
});
