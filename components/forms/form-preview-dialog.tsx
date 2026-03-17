"use client"

import * as React from "react"
import { Eye } from "lucide-react"

import type { FormField, FormTemplate } from "@/lib/forms/builtin-templates"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

type PreviewTemplate = FormTemplate & {
  data_category?: "general" | "health" | "sensitive_health"
}

interface FormPreviewDialogProps {
  template: FormTemplate | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const HEALTH_CONSENT_TEXT =
  "Wyrazam wyrazna zgode na przetwarzanie podanych przeze mnie danych dotyczacych zdrowia zawartych w formularzu w celu oceny przeciwskazan oraz bezpiecznego wykonania wybranej uslugi. Przyjmuje do wiadomosci, ze brak tej zgody moze uniemozliwic wykonanie zabiegu."

function isFieldVisible(
  field: FormField,
  answers: Record<string, unknown>,
): boolean {
  if (!field.conditionalShowIf) return true

  const { fieldId, value } = field.conditionalShowIf
  const answer = answers[fieldId]

  if (Array.isArray(answer)) return answer.includes(value)
  if (typeof answer === "boolean") {
    return answer === true && (value === "true" || value === "Tak")
  }

  return answer === value
}

export function FormPreviewDialog({
  template,
  open,
  onOpenChange,
}: FormPreviewDialogProps) {
  const previewTemplate = template as PreviewTemplate | null
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const [answers, setAnswers] = React.useState<Record<string, any>>({})
  const [isDrawing, setIsDrawing] = React.useState(false)

  React.useEffect(() => {
    if (!open) {
      setAnswers({})
      setIsDrawing(false)
      const canvas = canvasRef.current
      const ctx = canvas?.getContext("2d")
      if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
    }
  }, [open, template])

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()
    const clientX =
      "touches" in e ? e.touches[0]?.clientX ?? 0 : e.clientX
    const clientY =
      "touches" in e ? e.touches[0]?.clientY ?? 0 : e.clientY

    return {
      x: (clientX - rect.left) * (canvas.width / canvas.offsetWidth),
      y: (clientY - rect.top) * (canvas.height / canvas.offsetHeight),
    }
  }

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    setIsDrawing(true)

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const { x, y } = getCoordinates(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineWidth = 2
    ctx.lineCap = "round"
    ctx.strokeStyle = "#000"

    setAnswers((current) => ({ ...current, signature_preview: "signed" }))
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return

    e.preventDefault()

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const { x, y } = getCoordinates(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const stopDrawing = () => {
    setIsDrawing(false)
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }

    setAnswers((current) => {
      const next = { ...current }
      delete next.signature_preview
      return next
    })
  }

  const visibleFields =
    previewTemplate?.fields.filter(
      (field) =>
        field.type !== "section_header" && isFieldVisible(field, answers),
    ) ?? []
  const totalFields = visibleFields.length
  const filledFields = visibleFields.filter((field) => {
    const value =
      field.type === "signature" ? answers.signature_preview : answers[field.id]
    return value && !(Array.isArray(value) && value.length === 0)
  }).length
  const progress = totalFields > 0 ? (filledFields / totalFields) * 100 : 0
  const requiresHealthConsent =
    previewTemplate?.data_category === "health" ||
    previewTemplate?.data_category === "sensitive_health"

  const renderField = (field: FormField) => {
    if (!isFieldVisible(field, answers)) return null

    return (
      <div key={field.id} className="space-y-4">
        {field.type === "section_header" ? (
          <div className="mt-8 border-t border-gray-100 pt-8 first:mt-0 first:border-0 first:pt-0">
            <h3 className="text-xl font-black uppercase tracking-widest text-gray-400">
              {field.label}
            </h3>
          </div>
        ) : (
          <>
            <label className="block text-xl font-bold leading-tight text-gray-900">
              {field.label}
              {field.required ? (
                <span className="ml-1 text-red-500">*</span>
              ) : null}
            </label>

            {field.helpText ? (
              <p className="text-sm leading-relaxed text-gray-500">
                {field.helpText}
              </p>
            ) : null}

            {field.type === "text" ? (
              <input
                type="text"
                placeholder="Twoja odpowiedź..."
                className="w-full rounded-2xl border-2 border-gray-100 bg-gray-50/50 px-5 py-4 text-lg outline-none transition-all placeholder:text-gray-300 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50/50"
                value={answers[field.id] || ""}
                onChange={(e) =>
                  setAnswers((current) => ({
                    ...current,
                    [field.id]: e.target.value,
                  }))
                }
              />
            ) : null}

            {field.type === "textarea" ? (
              <textarea
                placeholder="Twoja odpowiedź..."
                rows={4}
                className="w-full resize-none rounded-2xl border-2 border-gray-100 bg-gray-50/50 px-5 py-4 text-lg outline-none transition-all placeholder:text-gray-300 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50/50"
                value={answers[field.id] || ""}
                onChange={(e) =>
                  setAnswers((current) => ({
                    ...current,
                    [field.id]: e.target.value,
                  }))
                }
              />
            ) : null}

            {field.type === "select" ? (
              <select
                className="w-full cursor-pointer appearance-none rounded-2xl border-2 border-gray-100 bg-gray-50/50 px-5 py-4 text-lg outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50/50"
                value={answers[field.id] || ""}
                onChange={(e) =>
                  setAnswers((current) => ({
                    ...current,
                    [field.id]: e.target.value,
                  }))
                }
              >
                <option value="">Wybierz opcję...</option>
                {field.options?.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : null}

            {field.type === "radio" ? (
              <div className="grid gap-4">
                {field.options?.map((option) => (
                  <label
                    key={option}
                    className={`flex cursor-pointer items-center space-x-4 rounded-2xl border-2 p-5 transition-all hover:shadow-md ${
                      answers[field.id] === option
                        ? "border-blue-600 bg-blue-50/50 ring-2 ring-blue-100"
                        : "border-gray-50 bg-gray-50/30"
                    }`}
                  >
                    <div
                      className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all ${
                        answers[field.id] === option
                          ? "border-blue-600 bg-blue-600"
                          : "border-gray-300"
                      }`}
                    >
                      {answers[field.id] === option ? (
                        <div className="h-2.5 w-2.5 rounded-full bg-white" />
                      ) : null}
                    </div>
                    <input
                      type="radio"
                      name={field.id}
                      value={option}
                      className="hidden"
                      checked={answers[field.id] === option}
                      onChange={() =>
                        setAnswers((current) => ({
                          ...current,
                          [field.id]: option,
                        }))
                      }
                    />
                    <span
                      className={`text-lg font-medium ${
                        answers[field.id] === option
                          ? "text-blue-900"
                          : "text-gray-600"
                      }`}
                    >
                      {option}
                    </span>
                  </label>
                ))}
              </div>
            ) : null}

            {field.type === "checkbox" ? (
              <div className="grid gap-4">
                {field.options && field.options.length > 0 ? (
                  field.options.map((option) => {
                    const selected = (answers[field.id] || []).includes(option)

                    return (
                      <label
                        key={option}
                        className={`flex cursor-pointer items-center space-x-4 rounded-2xl border-2 p-5 transition-all hover:shadow-md ${
                          selected
                            ? "border-blue-600 bg-blue-50/50 ring-2 ring-blue-100"
                            : "border-gray-50 bg-gray-50/30"
                        }`}
                      >
                        <div
                          className={`flex h-6 w-6 items-center justify-center rounded-lg border-2 transition-all ${
                            selected
                              ? "border-blue-600 bg-blue-600"
                              : "border-gray-300"
                          }`}
                        >
                          {selected ? (
                            <svg
                              className="h-4 w-4 text-white"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="3"
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          ) : null}
                        </div>
                        <input
                          type="checkbox"
                          value={option}
                          className="hidden"
                          checked={selected}
                          onChange={(e) => {
                            const currentValues = answers[field.id] || []
                            const nextValues = e.target.checked
                              ? [...currentValues, option]
                              : currentValues.filter(
                                  (value: string) => value !== option,
                                )

                            setAnswers((current) => ({
                              ...current,
                              [field.id]: nextValues,
                            }))
                          }}
                        />
                        <span
                          className={`text-lg font-medium ${
                            selected ? "text-blue-900" : "text-gray-600"
                          }`}
                        >
                          {option}
                        </span>
                      </label>
                    )
                  })
                ) : (
                  <label
                    className={`flex cursor-pointer items-center space-x-4 rounded-2xl border-2 p-5 transition-all hover:shadow-md ${
                      answers[field.id]
                        ? "border-blue-600 bg-blue-50/50 ring-2 ring-blue-100"
                        : "border-gray-50 bg-gray-50/30"
                    }`}
                  >
                    <div
                      className={`flex h-6 w-6 items-center justify-center rounded-lg border-2 transition-all ${
                        answers[field.id]
                          ? "border-blue-600 bg-blue-600"
                          : "border-gray-300"
                      }`}
                    >
                      {answers[field.id] ? (
                        <svg
                          className="h-4 w-4 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="3"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      ) : null}
                    </div>
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={!!answers[field.id]}
                      onChange={(e) =>
                        setAnswers((current) => ({
                          ...current,
                          [field.id]: e.target.checked,
                        }))
                      }
                    />
                    <span
                      className={`text-lg font-medium ${
                        answers[field.id] ? "text-blue-900" : "text-gray-600"
                      }`}
                    >
                      Tak / Potwierdzam
                    </span>
                  </label>
                )}
              </div>
            ) : null}

            {field.type === "date" ? (
              <input
                type="date"
                className="w-full rounded-2xl border-2 border-gray-100 bg-gray-50/50 px-5 py-4 text-lg outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50/50"
                value={answers[field.id] || ""}
                onChange={(e) =>
                  setAnswers((current) => ({
                    ...current,
                    [field.id]: e.target.value,
                  }))
                }
              />
            ) : null}

            {field.type === "photo_upload" ? (
              <div className="space-y-4">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  id={`preview-file-${field.id}`}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return

                    const reader = new FileReader()
                    reader.onloadend = () => {
                      setAnswers((current) => ({
                        ...current,
                        [field.id]: reader.result as string,
                      }))
                    }
                    reader.readAsDataURL(file)
                  }}
                />
                <label
                  htmlFor={`preview-file-${field.id}`}
                  className="group flex cursor-pointer flex-col items-center justify-center rounded-3xl border-4 border-dashed border-gray-100 p-10 transition-all hover:border-blue-400 hover:bg-blue-50/50"
                >
                  {answers[field.id] ? (
                    <div className="relative aspect-video w-full overflow-hidden rounded-2xl shadow-lg">
                      <img
                        src={answers[field.id]}
                        alt="Podgląd zdjęcia"
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-blue-900/40 opacity-0 transition-all group-hover:opacity-100">
                        <span className="text-xl font-black uppercase tracking-wide text-white">
                          Zmień zdjęcie
                        </span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 transition-all duration-300 group-hover:scale-110 group-hover:bg-blue-100">
                        <svg
                          className="h-10 w-10 text-gray-400 group-hover:text-blue-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                      </div>
                      <span className="text-lg font-bold text-gray-400 group-hover:text-blue-600">
                        Kliknij, aby dodać zdjęcie
                      </span>
                      <p className="mt-2 text-sm text-gray-300">
                        JPG, PNG lub GIF
                      </p>
                    </>
                  )}
                </label>
              </div>
            ) : null}

            {field.type === "signature" ? (
              <div className="space-y-4">
                <div className="relative overflow-hidden rounded-3xl border-4 border-gray-100 bg-gray-50/50 shadow-inner">
                  <canvas
                    ref={canvasRef}
                    width={800}
                    height={400}
                    className="h-auto w-full touch-none cursor-crosshair"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                </div>
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center space-x-2">
                    <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                    <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                      Podpis klienta
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={clearCanvas}
                    className="rounded-xl bg-blue-50 px-5 py-2 text-sm font-black uppercase tracking-tighter text-blue-600 transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    Wyczyść
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="border-b bg-white px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <Eye className="h-4 w-4 text-blue-600" />
            Podgląd formularza
          </DialogTitle>
        </DialogHeader>

        {previewTemplate ? (
          <div className="min-h-full bg-gray-50 font-sans text-gray-900">
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
              Tryb podglądu — formularz nie zostanie wysłany
            </div>

            <header className="sticky top-0 z-10 border-b bg-white px-4 py-4">
              <div className="mx-auto flex max-w-2xl items-center justify-between">
                <h1 className="truncate text-xl font-bold">Mój Salon</h1>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-400">
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </div>
              </div>
              <div className="mx-auto mt-4 max-w-2xl">
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-2 rounded-full bg-blue-600 transition-all duration-500 ease-out"
                    style={{ width: `${Math.min(progress, 100)}%` }}
                  />
                </div>
                <p className="mt-1.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Postęp: {Math.round(progress)}%
                </p>
              </div>
            </header>

            <main className="mx-auto mt-6 max-w-2xl p-4">
              <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm md:p-10">
                <div className="mb-10">
                  <h2 className="mb-3 text-3xl font-extrabold tracking-tight text-gray-900">
                    {previewTemplate.name}
                  </h2>
                  <p className="border-l-4 border-blue-500 pl-4 text-lg italic leading-relaxed text-gray-500">
                    Witaj{" "}
                    <span className="font-bold text-gray-900">
                      Jan Kowalski
                    </span>
                    , prosimy o rzetelne wypełnienie poniższego formularza.
                  </p>
                </div>

                <div className="space-y-12">
                  {previewTemplate.fields.map((field) => renderField(field))}

                  {previewTemplate.gdpr_consent_text ? (
                    <div className="space-y-5 border-t border-gray-100 pt-12">
                      <label
                        className={`flex cursor-pointer items-start space-x-5 rounded-3xl border-2 p-6 transition-all hover:shadow-lg ${
                          answers.gdpr_consent
                            ? "border-blue-600 bg-blue-50/50"
                            : "border-gray-50 bg-gray-50/20"
                        }`}
                      >
                        <div
                          className={`mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border-2 transition-all ${
                            answers.gdpr_consent
                              ? "border-blue-600 bg-blue-600"
                              : "border-gray-300"
                          }`}
                        >
                          {answers.gdpr_consent ? (
                            <svg
                              className="h-5 w-5 text-white"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="4"
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          ) : null}
                        </div>
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={!!answers.gdpr_consent}
                          onChange={(e) =>
                            setAnswers((current) => ({
                              ...current,
                              gdpr_consent: e.target.checked,
                            }))
                          }
                        />
                        <span
                          className={`text-sm font-medium leading-relaxed md:text-base ${
                            answers.gdpr_consent
                              ? "text-blue-950"
                              : "text-gray-500"
                          }`}
                        >
                          {previewTemplate.gdpr_consent_text}
                        </span>
                      </label>
                    </div>
                  ) : null}

                  {requiresHealthConsent ? (
                    <div className="space-y-5">
                      <label
                        className={`flex cursor-pointer items-start space-x-5 rounded-3xl border-2 p-6 transition-all hover:shadow-lg ${
                          answers.health_consent
                            ? "border-emerald-600 bg-emerald-50/60"
                            : "border-amber-200 bg-amber-50/50"
                        }`}
                      >
                        <div
                          className={`mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border-2 transition-all ${
                            answers.health_consent
                              ? "border-emerald-600 bg-emerald-600"
                              : "border-amber-400 bg-white"
                          }`}
                        >
                          {answers.health_consent ? (
                            <svg
                              className="h-5 w-5 text-white"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="4"
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          ) : null}
                        </div>
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={!!answers.health_consent}
                          onChange={(e) =>
                            setAnswers((current) => ({
                              ...current,
                              health_consent: e.target.checked,
                            }))
                          }
                        />
                        <span
                          className={`text-sm font-medium leading-relaxed md:text-base ${
                            answers.health_consent
                              ? "text-emerald-950"
                              : "text-amber-900"
                          }`}
                        >
                          {HEALTH_CONSENT_TEXT}
                        </span>
                      </label>
                    </div>
                  ) : null}

                  <div className="pt-6">
                    <Button
                      type="button"
                      onClick={() => onOpenChange(false)}
                      className="flex h-auto w-full items-center justify-center space-x-4 rounded-3xl bg-gradient-to-br from-blue-500 to-blue-700 px-8 py-6 text-2xl font-black uppercase tracking-widest text-white shadow-2xl transition-all hover:from-blue-600 hover:to-blue-800 hover:shadow-blue-500/40 active:scale-[0.96]"
                    >
                      <Eye className="h-7 w-7" />
                      <span>Zamknij podgląd</span>
                    </Button>
                  </div>
                </div>
              </div>
            </main>
          </div>
        ) : (
          <div className="bg-gray-50 px-6 py-16 text-center text-sm text-gray-500">
            Brak szablonu do podglądu.
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default FormPreviewDialog
