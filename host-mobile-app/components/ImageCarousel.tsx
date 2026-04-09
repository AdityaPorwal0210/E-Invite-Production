import React, { useState } from 'react';
import { 
  View, 
  ScrollView, 
  Image, 
  Text, 
  StyleSheet, 
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  TouchableOpacity // <-- We need this to make images clickable
} from 'react-native';
import ImageViewing from 'react-native-image-viewing'; // <-- The new library

interface ImageCarouselProps {
  images: string[];
}

const { width: screenWidth } = Dimensions.get('window');

export default function ImageCarousel({ images }: ImageCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  
  // New state to control when the full-screen modal is open
  const [isViewerVisible, setIsViewerVisible] = useState(false); 

  if (!Array.isArray(images) || images.length === 0) return null;

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const slide = Math.round(
      event.nativeEvent.contentOffset.x / event.nativeEvent.layoutMeasurement.width
    );
    
    if (slide !== activeIndex && slide >= 0 && slide < images.length) {
      setActiveIndex(slide);
    }
  };

  // The library expects an array of objects structured like { uri: "..." }
  // This maps your simple string array into the correct format instantly.
  const formattedImages = images.map(img => ({ uri: img }));

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {images.map((img, index) => (
          <TouchableOpacity 
            key={index.toString()} 
            activeOpacity={0.9} 
            onPress={() => setIsViewerVisible(true)} // Tapping opens the viewer
          >
            <Image 
              source={{ uri: img }} 
              style={styles.image} 
            />
          </TouchableOpacity>
        ))}
      </ScrollView>

      {images.length > 1 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {activeIndex + 1} / {images.length}
          </Text>
        </View>
      )}

      {/* --- THE FULL SCREEN LIGHTBOX MODAL --- */}
      <ImageViewing
        images={formattedImages}
        imageIndex={activeIndex} // Opens exactly to the image you tapped
        visible={isViewerVisible}
        onRequestClose={() => setIsViewerVisible(false)}
        swipeToCloseEnabled={true}
        doubleTapToZoomEnabled={true}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    position: 'relative',
    width: '100%',
    backgroundColor: '#E5E7EB', 
  },
  image: { 
    width: screenWidth, 
    height: 350,        
    resizeMode: 'cover' 
  },
  badge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.75)', 
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