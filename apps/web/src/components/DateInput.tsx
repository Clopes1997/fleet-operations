import { useEffect, useRef, useState } from "react";
import { formatDate, parseDate } from "../lib/calendar";
type Props = { name?: string; value?: string; defaultValue?: string; required?: boolean; disabled?: boolean; form?: string; onChange?: (iso: string) => void };
/** Visible text is unambiguous; only the hidden ISO value participates in FormData. */
export function DateInput({ name, value, defaultValue = "", onChange, ...props }: Props) {
  const [display, setDisplay] = useState(formatDate(value ?? defaultValue));
  useEffect(() => { if (value !== undefined) setDisplay(current => {
    try { return parseDate(current) === value ? current : formatDate(value); } catch { return value ? formatDate(value) : current; }
  }); }, [value]);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = input.current?.form;
    const reset = () => {
      if (value === undefined) setDisplay(formatDate(defaultValue));
      input.current?.setCustomValidity("");
    };
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [value, defaultValue]);
  let iso = "";
  try { iso = display ? parseDate(display) : ""; } catch { /* visible field blocks invalid submission */ }
  return <><input ref={input} {...props} type="text" inputMode="numeric" placeholder="aaaa/mm/dd" pattern="[0-9]{4}/[0-9]{2}/[0-9]{2}" maxLength={10} value={display}
    onChange={e => {
      const text = e.target.value; setDisplay(text);
      let parsed = "";
      try { parsed = text ? parseDate(text) : ""; e.target.setCustomValidity(""); }
      catch { e.target.setCustomValidity("Informe uma data válida no formato aaaa/mm/dd."); }
      onChange?.(parsed);
    }} /><input type="hidden" name={name} form={props.form} disabled={props.disabled} value={iso} /></>;
}
