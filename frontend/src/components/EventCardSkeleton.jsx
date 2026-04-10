const EventCardSkeleton = () => {
  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden h-full">
      {/* Image Skeleton */}
      <div className="h-48 bg-gray-200 animate-pulse w-full"></div>
      
      {/* Content Skeleton */}
      <div className="p-4 space-y-4">
        {/* Title */}
        <div className="h-6 bg-gray-200 rounded animate-pulse w-3/4"></div>
        
        {/* Date */}
        <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2"></div>
        
        {/* Location */}
        <div className="h-4 bg-gray-200 rounded animate-pulse w-2/3"></div>
        
        {/* Host */}
        <div className="h-4 bg-gray-200 rounded animate-pulse w-1/3 mt-4"></div>
      </div>
    </div>
  );
};

export default EventCardSkeleton;