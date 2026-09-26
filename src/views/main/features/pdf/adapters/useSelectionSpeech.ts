import { useCallback, useEffect, useRef, useState } from "react"

export function useSelectionSpeech(onError: (message: string) => void) {
  const currentUtterance = useRef<SpeechSynthesisUtterance | null>(null)
  const [reading, setReading] = useState(false)
  const stop = useCallback(() => {
    currentUtterance.current = null
    window.speechSynthesis?.cancel()
    setReading(false)
  }, [])
  useEffect(() => stop, [stop])
  const read = useCallback(
    (text: string) => {
      if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") {
        onError("이 환경에서는 읽어주기를 사용할 수 없습니다.")
        return
      }
      stop()
      const utterance = new SpeechSynthesisUtterance(text)
      currentUtterance.current = utterance
      utterance.lang = /[가-힣]/.test(text) ? "ko-KR" : "en-US"
      utterance.onend = () => {
        if (currentUtterance.current === utterance) setReading(false)
      }
      utterance.onerror = (event) => {
        setReading(false)
        if (event.error !== "canceled" && event.error !== "interrupted")
          onError("선택한 구절을 읽지 못했습니다. 다시 시도해 주세요.")
      }
      setReading(true)
      window.speechSynthesis.speak(utterance)
    },
    [onError, stop],
  )
  return { reading, read, stop }
}
