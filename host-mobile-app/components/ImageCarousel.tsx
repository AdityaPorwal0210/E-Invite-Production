import React, { useState } from 'react';
import { 
  View, 
  ScrollView, 
  Image, 
  Text, 
  StyleSheet, 
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent
} from 'react-native';

// Defines the exact shape of the props
interface ImageCarouselProps {
  images: string[];
}

// 1. Grab the raw screen width. No padding subtractions.
const { width: screenWidth } = Dimensions.get('window');

export default function ImageCarousel({ images }: ImageCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  // Failsafe: If no images exist or it's not an array, render nothing.
  if (!Array.isArray(images) || images.length === 0) return null;

  // Strictly typed scroll event
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    // Calculate the current index based on scroll position
    const slide = Math.round(
      event.nativeEvent.contentOffset.x / event.nativeEvent.layoutMeasurement.width
    );
    
    // Only update state if the index actually changed and is within bounds
    if (slide !== activeIndex && slide >= 0 && slide < images.length) {
      setActiveIndex(slide);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        pagingEnabled // Snaps to the next image natively
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16} // Fires 60fps for smooth state updates
      >
        {images.map((img, index) => (
          <Image 
            key={index.toString()} 
            source={{ uri: img }} 
            style={styles.image} 
          />
        ))}
      </ScrollView>

      {/* Only render the badge if there is more than 1 image */}
      {images.length > 1 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {activeIndex + 1} / {images.length}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    position: 'relative',
    width: '100%',
    backgroundColor: '#E5E7EB', // Neutral gray background while images load
  },
  image: { 
    width: screenWidth, // 2. Forces image to strictly touch left/right edges
    height: 350,        // 3. Expands vertical footprint to fix the "small" look
    resizeMode: 'cover' 
  },
  badge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.75)', // Dark semi-transparent background
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: { 
    color: '#FFFFFF', 
    fontWeight: 'bold', 
    fontSize: 12,
    letterSpacing: 1, 
  },
});