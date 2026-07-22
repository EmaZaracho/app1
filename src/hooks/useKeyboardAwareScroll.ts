import { useCallback, useEffect, useRef, type RefObject } from 'react';
import {
  Keyboard,
  Platform,
  type KeyboardEvent as RNKeyboardEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
  type TextInput,
} from 'react-native';

/** Separación mínima que se deja entre el campo enfocado y el borde superior del teclado. */
const SAFE_MARGIN = 20;

export interface UseKeyboardAwareScrollResult {
  scrollRef: RefObject<ScrollView | null>;
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle: number;
  /** Llamar en el `onFocus` de cada TextInput, pasando su propio ref. */
  registerFocusedInput: (ref: RefObject<TextInput | null>) => void;
  /** Llamar en el `onBlur` del campo (opcional; el listener de ocultar teclado ya limpia el estado). */
  clearFocusedInput: () => void;
}

/**
 * Desplaza un ScrollView lo justo y necesario para que el campo de texto
 * enfocado quede visible por encima del teclado, midiendo su posición REAL
 * en pantalla (`measureInWindow`) contra el borde superior real del teclado
 * (`screenY` del evento nativo) en el momento en que el teclado ya terminó
 * de aparecer/cambiar de tamaño. No asume ninguna altura de teclado, tab bar
 * ni dispositivo, y no hace `scrollToEnd` incondicional: si el campo ya está
 * visible, no desplaza nada.
 */
export function useKeyboardAwareScroll(): UseKeyboardAwareScrollResult {
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);
  const focusedInputRef = useRef<RefObject<TextInput | null> | null>(null);
  const keyboardTopRef = useRef<number | null>(null);

  const adjustScroll = useCallback(() => {
    const input = focusedInputRef.current?.current;
    const keyboardTop = keyboardTopRef.current;
    if (!input || keyboardTop == null) return;
    input.measureInWindow((_x: number, y: number, _width: number, height: number) => {
      const inputBottom = y + height;
      const overlap = inputBottom + SAFE_MARGIN - keyboardTop;
      if (overlap <= 0) return; // ya visible arriba del teclado: no desplazar de más
      const nextOffset = Math.max(0, scrollOffsetRef.current + overlap);
      scrollRef.current?.scrollTo({ y: nextOffset, animated: true });
    });
  }, []);

  useEffect(() => {
    // En Android con adjustResize/adjustNothing solo existen los eventos "Did";
    // en iOS se prefieren los "Will"/"DidChangeFrame" para reaccionar apenas
    // arranca la animación del teclado.
    const showEvents = Platform.OS === 'ios' ? (['keyboardWillShow', 'keyboardDidChangeFrame'] as const) : (['keyboardDidShow'] as const);
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const handleShow = (e: RNKeyboardEvent) => {
      keyboardTopRef.current = e.endCoordinates.screenY;
      // Esperar al siguiente frame (no un timer fijo) para medir con el layout ya asentado.
      requestAnimationFrame(adjustScroll);
    };
    const handleHide = () => {
      keyboardTopRef.current = null;
    };

    const subs = showEvents.map((evt) => Keyboard.addListener(evt, handleShow));
    const hideSub = Keyboard.addListener(hideEvent, handleHide);
    return () => {
      subs.forEach((s) => s.remove());
      hideSub.remove();
    };
  }, [adjustScroll]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
  }, []);

  const registerFocusedInput = useCallback(
    (ref: RefObject<TextInput | null>) => {
      focusedInputRef.current = ref;
      // Cambiar de campo sin que el teclado se cierre (p. ej. con "next"):
      // el teclado ya está arriba, así que hay que reevaluar ya mismo.
      if (keyboardTopRef.current != null) {
        requestAnimationFrame(adjustScroll);
      }
    },
    [adjustScroll]
  );

  const clearFocusedInput = useCallback(() => {
    focusedInputRef.current = null;
  }, []);

  return { scrollRef, onScroll, scrollEventThrottle: 16, registerFocusedInput, clearFocusedInput };
}
