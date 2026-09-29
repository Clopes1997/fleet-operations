import type { FormEvent } from "react";
function control(event: FormEvent) {
  const target = event.target;
  return target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement ? target : undefined;
}
export function clearValidation(event: FormEvent) { control(event)?.setCustomValidity(""); }
export function localizeValidation(event: FormEvent) {
  const input = control(event);
  if (!input || input.validity.customError) return;
  const validity = input.validity;
  input.setCustomValidity(validity.valueMissing ? "Preencha este campo."
    : validity.rangeUnderflow || validity.rangeOverflow ? "Informe um valor dentro do intervalo permitido."
    : validity.stepMismatch || validity.badInput ? "Informe um número válido."
    : validity.patternMismatch || validity.typeMismatch ? "Confira o formato informado."
    : "Confira o valor informado.");
}
