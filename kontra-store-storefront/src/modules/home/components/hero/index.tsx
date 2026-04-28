import Image from "next/image"

const Hero = () => {
  return (
    <div className="relative w-full h-[50vh] md:h-[75vh] border-b border-ui-border-base bg-ui-bg-subtle overflow-hidden">
      
      <div className="absolute inset-0">
        <Image 
          src="/images/banner.jpeg" 
          alt="Hero Banner"
          fill // fill the parent div
          priority 
          className="object-cover" // Equivalent to background-size: cover
          sizes="100vw"
        />
      </div>
    </div>
  )
}

export default Hero