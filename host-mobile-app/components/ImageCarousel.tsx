import React, { useState, useRef } from 'react';
import { 
  View, 
  ScrollView, 
  Image, 
  Text, 
  StyleSheet, 
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  TouchableOpacity,
  SafeAreaView
} from 'react-native';
import ImageViewing from 'react-native-image-viewing';
import { Ionicons } from '@expo/vector-icons';

interface ImageCarouselProps {
  images: string[];
}

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function ImageCarousel({ images }: ImageCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isViewerVisible, setIsViewerVisible] = useState(false);
  const [modalActiveIndex, setModalActiveIndex] = useState(0);
  
  // Create a reference to control the inline ScrollView programmatically
  const scrollViewRef = useRef<ScrollView>(null);

  if (!Array.isArray(images) || images.length === 0) return null;

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const slide = Math.round(
      event.nativeEvent.contentOffset.x / event.nativeEvent.layoutMeasurement.width
    );
    if (slide !== activeIndex && slide >= 0 && slide < images.length) {
      setActiveIndex(slide);
    }
  };

  // Function to physically scroll the inline carousel when an arrow is tapped
  const scrollToSlide = (index: number) => {
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({ x: index * screenWidth, animated: true });
    }
  };

  const formattedImages = images.map(img => ({ uri: img }));

  const openModal = () => {
    setModalActiveIndex(activeIndex);
    setIsViewerVisible(true);
  };

  // The Full-Screen Modal Overlay
  const LightboxHeader = ({ currentIndex }: { currentIndex: number }) => (
    <SafeAreaView style={styles.lightboxHeaderContainer}>
      <View style={styles.lightboxHeader}>
        <Text style={styles.lightboxCounterText}>
          {currentIndex + 1} / {images.length}
        </Text>
        <TouchableOpacity 
          style={styles.closeButton} 
          onPress={() => setIsViewerVisible(false)}
        >
          <Ionicons name="close" size={28} color="white" />
        </TouchableOpacity>
      </View>

      {currentIndex > 0 && (
        <View style={styles.modalArrowLeft}>
          <Ionicons name="chevron-back" size={36} color="rgba(255,255,255,0.7)" />
        </View>
      )}

      {currentIndex < images.length - 1 && (
        <View style={styles.modalArrowRight}>
          <Ionicons name="chevron-forward" size={36} color="rgba(255,255,255,0.7)" />
        </View>
      )}
    </SafeAreaView>
  );

  return (
    <View style={styles.container}>
      {/* INLINE CAROUSEL */}
      <ScrollView
        ref={scrollViewRef}
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
            onPress={openModal}
          >
            <Image source={{ uri: img }} style={styles.image} />
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* --- INLINE NAVIGATION ARROWS --- */}
      {images.length > 1 && activeIndex > 0 && (
        <TouchableOpacity 
          style={styles.inlineArrowLeft} 
          onPress={() => scrollToSlide(activeIndex - 1)}
        >
          <Ionicons name="chevron-back" size={24} color="white" />
        </TouchableOpacity>
      )}

      {images.length > 1 && activeIndex < images.length - 1 && (
        <TouchableOpacity 
          style={styles.inlineArrowRight} 
          onPress={() => scrollToSlide(activeIndex + 1)}
        >
          <Ionicons name="chevron-forward" size={24} color="white" />
        </TouchableOpacity>
      )}

      {/* INLINE COUNTER BADGE */}
      {images.length > 1 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {activeIndex + 1} / {images.length}
          </Text>
        </View>
      )}

      {/* FULL SCREEN LIGHTBOX */}
      <ImageViewing
        images={formattedImages}
        imageIndex={modalActiveIndex}
        visible={isViewerVisible}
        onRequestClose={() => setIsViewerVisible(false)}
        onImageIndexChange={(imageIndex) => setModalActiveIndex(imageIndex)}
        HeaderComponent={() => <LightboxHeader currentIndex={modalActiveIndex} />}
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
    height: 400,        
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

  // --- Inline Arrow Styles ---
  inlineArrowLeft: {
    position: 'absolute',
    top: '50%',
    marginTop: -20, // Vertically center a 40px tall circle
    left: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inlineArrowRight: {
    position: 'absolute',
    top: '50%',
    marginTop: -20,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // --- Lightbox Custom Overlay Styles ---
  lightboxHeaderContainer: {
    width: '100%',
    position: 'absolute',
    top: 0,
    zIndex: 10,
  },
  lightboxHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10, 
  },
  lightboxCounterText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 1,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10
  },
  closeButton: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 4,
  },
  modalArrowLeft: {
    position: 'absolute',
    top: screenHeight / 2 - 20, 
    left: 10,
  },
  modalArrowRight: {
    position: 'absolute',
    top: screenHeight / 2 - 20, 
    right: 10,
  }
});