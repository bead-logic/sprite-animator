# **Sprite Animator 🧙‍♂️**

Sprite Animator is a web-based React application designed to preview, clean, and export sprite sheets. It is especially useful for game developers working with tightly packed or AI-generated sprite sheets where characters might "bleed" into adjacent frames.  
With Sprite Animator, you can define a custom viewing portal, automatically isolate your main sprite using a flood-fill algorithm, and export the result as a perfectly spaced new sprite sheet or an animated GIF.

## **✨ Features**

* **Interactive Animation Preview:** Upload a sprite sheet and immediately see it animated. Adjust playback speed and zoom levels on the fly.  
* **Flexible Grid System:** Define any number of columns and rows to slice your sprite sheet.  
* **Smart Portal Sizing:** Expand or shrink the "Portal" (bounding box) around your character to ensure weapons or long limbs are fully captured without getting cut off.  
* **Smart Clean & Isolate:** Uses a background-tolerance flood-fill algorithm to detect your main character and erase floating artifacts, stray pixels, or overlapping limbs from adjacent frames.  
* **GIF Export:** Render your cleaned, perfectly-spaced animation directly to a .gif file with transparent backgrounds.  
* **Sheet Export:** Save your cleaned frames back into a brand new .png sprite sheet, preserving your custom padding.

## **🚀 How to Use**

1. **Upload:** Click the "Upload" button to load your .png or .jpg sprite sheet.  
2. **Define the Grid:** Enter the number of **Columns** and **Rows** that make up your sprite sheet.  
3. **Size the Portal:** In the "Frame & Clean" section, adjust the **Width** and **Height** sliders.  
   * *Tip:* Watch the **Blue Dashed Box** in the preview. Expand it until your character (and any moving parts like weapons) never leaves the blue box during the animation cycle.  
4. **Set Tolerance:** Adjust the **Clean Tolerance** slider until the red tint perfectly covers your character but ignores the background and overlapping artifacts.  
5. **Clean:** Click **"✨ Create Clean Sheet"**. The app will isolate the sprite in every frame and build a new, perfectly spaced sheet.  
6. **Save:** Once cleaned, you can click **"Save Sheet"** to download the new .png, or **"Export GIF"** to download an animated .gif.

## **💻 Running Locally**

This project is built with React and uses modern hooks. The easiest way to run it locally is using [Vite](https://vitejs.dev/).

### **Prerequisites**

* Node.js installed on your machine.

### **Installation**

1. Clone your repository and navigate into it:
   ```bash
   git clone \[https://github.com/YOUR-USERNAME/sprite-animator.git\](https://github.com/YOUR-USERNAME/sprite-animator.git)  
   cd sprite-animator
   ```

2. Install the dependencies:
 ```bash
   npm install  
   npm install lucide-react
   ```
   *(Note: The `gif.js` library is loaded automatically via a CDN in the component, so you don't need to install it separately).*  
3. Start the development server:  
  ```bash
   npm run dev
  ```
4. Open your browser to the local URL provided (usually `http://localhost:5173`).

## **🛠️ Tech Stack**

* **React:** UI and state management.  
* **HTML5 Canvas:** Image manipulation, pixel reading, and flood-fill processing.  
* **lucide-react:** UI Icons.  
* **gif.js:** Client-side GIF encoding.
