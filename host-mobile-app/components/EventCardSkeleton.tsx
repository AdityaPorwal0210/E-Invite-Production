import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Dimensions } from 'react-native';
import { COLORS, SPACING, SHADOWS } from '../constants/theme';

export default function EventCardSkeleton() {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    // Creates a smooth, infinite pulsing effect
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={styles.card}>
      {/* Image Skeleton */}
      <Animated.View style={[styles.imageSkeleton, { opacity }]} />
      
      {/* Content Skeleton */}
      <View style={styles.content}>
        {/* Title */}
        <Animated.View style={[styles.textSkeleton, { width: '70%', height: 24, marginBottom: 12, opacity }]} />
        {/* Date Row */}
        <Animated.View style={[styles.textSkeleton, { width: '40%', height: 16, marginBottom: 8, opacity }]} />
        {/* Location Row */}
        <Animated.View style={[styles.textSkeleton, { width: '50%', height: 16, opacity }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    marginBottom: SPACING.md,
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  imageSkeleton: {
    width: '100%',
    height: 180,
    backgroundColor: '#E5E7EB', // Neutral gray
  },
  content: {
    padding: SPACING.lg,
  },
  textSkeleton: {
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
  },
});