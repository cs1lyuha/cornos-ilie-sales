import { useLayoutEffect, useRef, useState } from 'react';
import {
  type GestureResponderEvent,
  type LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { encodeSignature, parseSignature } from './types';

type Props = {
  /** Encoded signature (`{"w","h","d"}` JSON) to show initially. */
  value?: string;
  /** Called after every stroke with the encoded signature, or `undefined` when cleared. */
  onChange: (signature: string | undefined) => void;
  /** Lets the parent disable scrolling while the customer is signing. */
  onDrawingChange?: (drawing: boolean) => void;
  height?: number;
};

const MIN_POINT_DISTANCE = 1.5;

const round = (value: number) => Math.round(value * 10) / 10;
const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), max);

export function SignaturePad({ value, onChange, onDrawingChange, height = 170 }: Props) {
  const [strokes, setStrokes] = useState<string[]>(() => {
    const initial = parseSignature(value);
    return initial ? [initial.d] : [];
  });
  const [current, setCurrent] = useState('');

  const sizeRef = useRef({ w: 0, h: height });
  const strokesRef = useRef(strokes);
  const currentRef = useRef('');
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);
  const callbacksRef = useRef({ onChange, onDrawingChange });

  useLayoutEffect(() => {
    callbacksRef.current = { onChange, onDrawingChange };
  });

  function pointFrom(event: GestureResponderEvent) {
    const { w, h } = sizeRef.current;
    return {
      x: round(clamp(event.nativeEvent.locationX, w)),
      y: round(clamp(event.nativeEvent.locationY, h)),
    };
  }

  function finishStroke() {
    if (!currentRef.current) return;
    // A single tap becomes a tiny segment so round line caps render it as a dot.
    const stroke = movedRef.current ? currentRef.current : `${currentRef.current} l0.1 0`;
    const next = [...strokesRef.current, stroke];
    strokesRef.current = next;
    currentRef.current = '';
    lastPointRef.current = null;
    setStrokes(next);
    setCurrent('');
    const { w, h } = sizeRef.current;
    callbacksRef.current.onChange(encodeSignature({ w: Math.round(w), h: Math.round(h), d: next.join(' ') }));
    callbacksRef.current.onDrawingChange?.(false);
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (event) => {
        callbacksRef.current.onDrawingChange?.(true);
        const point = pointFrom(event);
        lastPointRef.current = point;
        movedRef.current = false;
        currentRef.current = `M${point.x} ${point.y}`;
        setCurrent(currentRef.current);
      },
      onPanResponderMove: (event) => {
        const point = pointFrom(event);
        const last = lastPointRef.current;
        if (last && Math.hypot(point.x - last.x, point.y - last.y) < MIN_POINT_DISTANCE) return;
        lastPointRef.current = point;
        movedRef.current = true;
        currentRef.current = `${currentRef.current} L${point.x} ${point.y}`;
        setCurrent(currentRef.current);
      },
      onPanResponderRelease: finishStroke,
      onPanResponderTerminate: finishStroke,
    }),
  ).current;

  function onLayout(event: LayoutChangeEvent) {
    const { width, height: measuredHeight } = event.nativeEvent.layout;
    sizeRef.current = { w: width, h: measuredHeight };
  }

  function clear() {
    strokesRef.current = [];
    currentRef.current = '';
    setStrokes([]);
    setCurrent('');
    onChange(undefined);
  }

  const d = [...strokes, current].filter(Boolean).join(' ');
  const isEmpty = d.length === 0;

  return (
    <View>
      <View style={[styles.pad, { height }]} onLayout={onLayout} {...panResponder.panHandlers}>
        {/* Children ignore touches so locationX/Y are always relative to the pad. */}
        <View style={[StyleSheet.absoluteFill, styles.noTouch]}>
          <View style={styles.baseline} />
          {isEmpty ? <Text style={styles.placeholder}>Semnătura clientului aici</Text> : null}
          <Svg width="100%" height="100%">
            {d ? (
              <Path d={d} stroke="#152033" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            ) : null}
          </Svg>
        </View>
      </View>
      <View style={styles.footer}>
        <Text style={styles.footerHint}>{isEmpty ? 'Clientul semnează cu degetul' : 'Semnătură capturată ✍️'}</Text>
        <Pressable onPress={clear} disabled={isEmpty} style={[styles.clearButton, isEmpty && styles.clearDisabled]}>
          <Text style={styles.clearText}>Șterge semnătura</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Renders a stored signature back (e.g. on a summary screen). */
export function SignaturePreview({ signature, height = 60 }: { signature?: string; height?: number }) {
  const data = parseSignature(signature);
  if (!data) return null;
  return (
    <Svg width={(data.w / data.h) * height} height={height} viewBox={`0 0 ${data.w} ${data.h}`}>
      <Path d={data.d} stroke="#152033" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  pad: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cfd7e6', borderStyle: 'dashed', borderRadius: 14, overflow: 'hidden' },
  noTouch: { pointerEvents: 'none' },
  baseline: { position: 'absolute', left: 20, right: 20, bottom: 36, height: 1, backgroundColor: '#e2e7f0' },
  placeholder: { position: 'absolute', left: 0, right: 0, bottom: 14, textAlign: 'center', color: '#a3acbd', fontSize: 12 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  footerHint: { color: '#68738a', fontSize: 12 },
  clearButton: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: '#e8eefb' },
  clearDisabled: { opacity: 0.4 },
  clearText: { color: '#2463d4', fontSize: 12, fontWeight: '700' },
});
