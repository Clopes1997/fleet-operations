import { test, expect } from "@playwright/test";
test("authenticated customer/order lifecycle preserves an overdue job", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByLabel("Usuário", { exact: true }).fill("fleet-test");
  await page
    .getByLabel("Senha", { exact: true })
    .fill("fleet-test-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sair", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clientes", exact: true }).click();
  const name = "Cliente de teste " + Date.now();
  await page.getByLabel("Nome").fill(name);
  await page
    .getByRole("button", { name: "Cadastrar cliente", exact: true })
    .click();
  await expect(page.getByText(new RegExp(name))).toBeVisible();
  await page
    .getByRole("button", { name: "Ordens de serviço", exact: true })
    .click();
  await page.getByLabel("Nome do cliente na ordem").fill(name);
  await page.getByLabel("Descrição", { exact: true }).fill("Reparo com prazo vencido");
  await page.getByLabel("Valor do orçamento").fill("12.34");
  await page.getByLabel("Prazo", { exact: true }).fill("2025/02/29");
  await expect(page.getByLabel("Prazo", { exact: true })).toHaveAttribute('placeholder','aaaa/mm/dd');
  expect(await page.getByLabel("Prazo", { exact: true }).evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(false);
  await page.getByLabel("Prazo", { exact: true }).fill("2020/01/01");
  const created = page.waitForRequest(r => r.method() === 'POST' && r.url().endsWith('/api/orders/'));

  await page.getByRole("button", { name: "Criar ordem", exact: true }).click();
  expect((await created).postDataJSON().deadline).toBe("2020-01-01");
  await page.getByLabel("Buscar ordens").fill(name);
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toContainText("12.34");
  await row.getByRole("button", { name: "Editar", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Situação", exact: true })
    .selectOption("em_andamento");
  await page.getByRole("button", { name: "Salvar ordem", exact: true }).click();
  await expect(row).toContainText("Em andamento");
  await page.screenshot({path:info.outputPath("fleet-ordens-pt-br.png"), fullPage:true, animations:"disabled"});
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Sair", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Entrar", exact: true }),
  ).toBeVisible();
});


test("Portuguese validation, dialogs and server failures", async ({ page }, info) => {
  await page.goto('/');
  await page.screenshot({path:info.outputPath('fleet-login-pt-br.png'),fullPage:true});
  await page.getByRole('button', {name:'Entrar', exact:true}).click();
  expect(await page.getByLabel('Usuário', {exact:true}).evaluate((input: HTMLInputElement) => input.validationMessage)).toBe('Preencha este campo.');
  await page.getByLabel('Usuário', {exact:true}).fill('fleet-test');
  await page.getByLabel('Senha', {exact:true}).fill('fleet-test-password');
  await page.getByRole('button', {name:'Entrar', exact:true}).click();
  await page.getByRole('button', {name:'Adicionar Caminhão', exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Ano de Fabricação');
  await page.screenshot({path:info.outputPath('fleet-caminhao-pt-br.png'),fullPage:true, animations:"disabled"});
  await page.getByRole('button', {name:'Fechar', exact:true}).click();
  await page.route('**/api/trucks/fipe/**', route => route.fulfill({status:503, contentType:'application/json', body:JSON.stringify({detail:'Upstream unavailable'})}));
  await page.getByRole('button', {name:'FIPE', exact:true}).click();
  await expect(page.getByRole('alert')).toHaveText('O serviço está indisponível. Tente novamente em instantes.');
  await expect(page.getByLabel('Marca FIPE')).toBeVisible();
  await expect(page.getByText('Upstream unavailable')).toHaveCount(0);
  await page.screenshot({path:info.outputPath('fleet-fipe-erro-pt-br.png'),fullPage:true});
});
