import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { COLORS, SHADOWS } from '../constants/theme';

export default function EventCardSkeleton() {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, [opacity]);

  return (
    <Animated.View style={[styles.card, { opacity }]}>
      {/* Content Skeleton (Left Side) */}
      <View style={styles.cardContent}>
        {/* Title */}
        <View style={[styles.textSkeleton, { width: '80%', height: 20, marginBottom: 10 }]} />
        {/* Date */}
        <View style={[styles.textSkeleton, { width: '50%', height: 14, marginBottom: 6 }]} />
        {/* Location */}
        <View style={[styles.textSkeleton, { width: '60%', height: 14 }]} />
      </View>
      
      {/* Image Skeleton (Right Side - 80x80) */}
      <View style={styles.imageSkeleton} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card || '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row', // MUST match your actual cards
    justifyContent: 'space-between',
    alignItems: 'center',
    ...(SHADOWS?.card || { elevation: 2, shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }),
  },
  cardContent: {
    flex: 1,
    marginRight: 16,
  },
  textSkeleton: {
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
  },
  imageSkeleton: {
    width: 80,
    height: 80,
    backgroundColor: '#E5E7EB',
    borderRadius: 12,
  },
});