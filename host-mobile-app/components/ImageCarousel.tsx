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
  TouchableOpacity,
  SafeAreaView // Required to keep the modal header out of the notch
} from 'react-native';
import ImageViewing from 'react-native-image-viewing';
import { Ionicons } from '@expo/vector-icons'; // We will use Expo's native icons for the arrows

interface ImageCarouselProps {
  images: string[];
}

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function ImageCarousel({ images }: ImageCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isViewerVisible, setIsViewerVisible] = useState(false);
  
  // We need to track the active index INSIDE the modal separately from the carousel
  const [modalActiveIndex, setModalActiveIndex] = useState(0);

  if (!Array.isArray(images) || images.length === 0) return null;

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const slide = Math.round(
      event.nativeEvent.contentOffset.x / event.nativeEvent.layoutMeasurement.width
    );
    if (slide !== activeIndex && slide >= 0 && slide < images.length) {
      setActiveIndex(slide);
    }
  };

  const formattedImages = images.map(img => ({ uri: img }));

  const openModal = () => {
    setModalActiveIndex(activeIndex); // Sync the modal to whatever image we tapped
    setIsViewerVisible(true);
  };

  // Custom UI overlay for the full-screen modal
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

      {/* Conditional Left Arrow */}
      {currentIndex > 0 && (
        <View style={styles.arrowLeft}>
          <Ionicons name="chevron-back" size={36} color="rgba(255,255,255,0.7)" />
        </View>
      )}

      {/* Conditional Right Arrow */}
      {currentIndex < images.length - 1 && (
        <View style={styles.arrowRight}>
          <Ionicons name="chevron-forward" size={36} color="rgba(255,255,255,0.7)" />
        </View>
      )}
    </SafeAreaView>
  );

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
            onPress={openModal}
          >
            <Image source={{ uri: img }} style={styles.image} />
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

      <ImageViewing
        images={formattedImages}
        imageIndex={modalActiveIndex}
        visible={isViewerVisible}
        onRequestClose={() => setIsViewerVisible(false)}
        onImageIndexChange={(imageIndex) => setModalActiveIndex(imageIndex)} // Update state as user swipes
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
  
  // Lightbox Custom Overlay Styles
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
    paddingTop: 10, // Adjusted for SafeAreaView
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
  arrowLeft: {
    position: 'absolute',
    top: screenHeight / 2 - 20, // Vertically center the arrow
    left: 10,
  },
  arrowRight: {
    position: 'absolute',
    top: screenHeight / 2 - 20, // Vertically center the arrow
    right: 10,
  }
});