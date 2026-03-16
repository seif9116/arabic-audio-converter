function audioConverter() {
  const converter = {
    file: null,
    status: 'idle',
    progress: 0,
    chunks: [],
    results: [],
    finalText: { arabic: '', english: '' },
    processing: false,
    chunkSize: 120,
    chunkLimit: 0,
    apiKey: '',
    googleApiKey: '',
    currentStatus: 'Ready to process audio',
    currentChunk: -1,

    async init() {
      console.log('Arabic Audio Converter initialized');
      await this.loadConfig();
    },

    async loadConfig() {
      if (window.CONFIG) {
        this.apiKey = window.CONFIG.OPENAI_API_KEY;
        this.googleApiKey = window.CONFIG.GOOGLE_CLOUD_API_KEY;
      } else {
        console.warn('API key not found. Please create a config.js file with your API key.');
      }
    },

    isValidMediaFile(file) {
      // Check MIME type first
      if (file.type.startsWith('audio/') || file.type.startsWith('video/')) {
        return true;
      }
      
      // Check file extension for cases where MIME type might not be detected properly
      const filename = file.name.toLowerCase();
      const validExtensions = [
        // Audio formats
        '.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma',
        // Video formats  
        '.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.3gp', '.flv', '.wmv'
      ];
      
      return validExtensions.some(ext => filename.endsWith(ext));
    },

    handleFileUpload(event) {
      console.log('handleFileUpload called', event);
      const files = Object.values(event.target.files);
      const uploadedFile = files[0];
      console.log('Selected file:', uploadedFile);
      
      if (uploadedFile) {
        console.log('File type:', uploadedFile.type);
        console.log('File name:', uploadedFile.name);
        console.log('Is valid media file:', this.isValidMediaFile(uploadedFile));
        
        if (this.isValidMediaFile(uploadedFile)) {
          // Clear any existing file first
          this.file = null;
          this._actualFile = null;
          
          // Use setTimeout to ensure Alpine.js detects the change
          setTimeout(() => {
            // Create a plain object that Alpine can make reactive
            this.file = {
              name: uploadedFile.name,
              size: uploadedFile.size,
              type: uploadedFile.type,
              lastModified: uploadedFile.lastModified
            };
            
            // Store the actual file object separately for processing
            this._actualFile = uploadedFile;
            
            this.status = 'idle';
            this.progress = 0;
            this.chunks = [];
            this.results = [];
            this.finalText = { arabic: '', english: '' };
            this.currentStatus = 'Ready to process audio';
            this.currentChunk = -1;
            
            console.log(`File loaded: ${uploadedFile.name}`);
            console.log(`File size: ${(uploadedFile.size / 1024 / 1024).toFixed(2)} MB`);
            console.log(`File type: ${uploadedFile.type}`);
            console.log(`Estimated duration: ${Math.round(uploadedFile.size / 1024 / 1024)} minutes (very rough estimate)`);
            
            // Log the current state for debugging
            console.log('Current file state:', this.file);
            console.log('File object properties:', Object.keys(this.file));
            console.log('File exists check:', !!this.file);
          }, 10);
        } else {
          console.log('Invalid file type');
          alert('Please select a valid audio or video file');
        }
      } else {
        console.log('No file selected');
      }
    },

    handleDrop(event) {
      event.preventDefault();
      event.target.classList.remove('dragover');
      
      const files = event.dataTransfer.files;
      if (files.length > 0) {
        const uploadedFile = files[0];
        console.log('Dropped file:', uploadedFile);
        
        if (this.isValidMediaFile(uploadedFile)) {
          // Clear any existing file first
          this.file = null;
          this._actualFile = null;
          
          // Use setTimeout to ensure Alpine.js detects the change
          setTimeout(() => {
            // Create a plain object that Alpine can make reactive
            this.file = {
              name: uploadedFile.name,
              size: uploadedFile.size,
              type: uploadedFile.type,
              lastModified: uploadedFile.lastModified
            };
            
            // Store the actual file object separately for processing
            this._actualFile = uploadedFile;
            this.status = 'idle';
            this.progress = 0;
            this.chunks = [];
            this.results = [];
            this.finalText = { arabic: '', english: '' };
            this.currentStatus = 'Ready to process audio';
            this.currentChunk = -1;
            
            console.log('File dropped successfully:', this.file);
            console.log('File exists check:', !!this.file);
          }, 10);
        } else {
          alert('Please drop a valid audio or video file');
        }
      }
    },

    getProcessingStatus() {
      if (this.progress <= 5) return 'Initializing...';
      if (this.progress <= 15) return 'Splitting audio into 2-minute chunks...';
      if (this.progress <= 85) return 'Transcribing and translating chunks...';
      if (this.progress <= 100) return 'Finalizing results...';
      return 'Processing...';
    },

    async splitAudioIntoChunks(audioFile) {
      return new Promise((resolve, reject) => {
        console.log(`📁 Reading audio file: ${audioFile.name} (${(audioFile.size / 1024 / 1024).toFixed(2)} MB)`);
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        const audioContext = new AudioContextClass();
        const fileReader = new FileReader();

        fileReader.onload = async (e) => {
          try {
            console.log('🔄 Decoding audio data...');
            const arrayBuffer = e.target.result;
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            
            const duration = audioBuffer.duration;
            const sampleRate = audioBuffer.sampleRate;
            const chunkDuration = this.chunkSize;
            const numberOfChannels = audioBuffer.numberOfChannels;
            
            console.log(`📊 Audio info: ${duration.toFixed(2)}s, ${sampleRate}Hz, ${numberOfChannels} channels`);
            console.log(`✂️ Creating ${chunkDuration}s chunks...`);
            
            const expectedChunks = Math.ceil(duration / chunkDuration);
            console.log(`📦 Expected ${expectedChunks} chunks`);
            
            const chunks = [];
            let totalChunkSize = 0;
            
            for (let start = 0; start < duration; start += chunkDuration) {
              const end = Math.min(start + chunkDuration, duration);
              const chunkLength = (end - start) * sampleRate;
              
              console.log(`Creating chunk ${chunks.length + 1}/${expectedChunks}: ${start.toFixed(1)}s - ${end.toFixed(1)}s`);
              
              const chunkBuffer = audioContext.createBuffer(
                numberOfChannels,
                chunkLength,
                sampleRate
              );
              
              for (let channel = 0; channel < numberOfChannels; channel++) {
                const channelData = audioBuffer.getChannelData(channel);
                const chunkChannelData = chunkBuffer.getChannelData(channel);
                
                for (let i = 0; i < chunkLength; i++) {
                  const sourceIndex = Math.floor(start * sampleRate) + i;
                  chunkChannelData[i] = sourceIndex < channelData.length ? channelData[sourceIndex] : 0;
                }
              }
              
              const chunkBlob = await this.audioBufferToBlob(chunkBuffer, audioFile.type);
              const chunkSizeMB = (chunkBlob.size / 1024 / 1024).toFixed(2);
              totalChunkSize += chunkBlob.size;
              
              console.log(`📦 Chunk ${chunks.length + 1} created: ${chunkSizeMB} MB`);
              
              chunks.push({
                id: chunks.length,
                blob: chunkBlob,
                startTime: start,
                endTime: end,
                duration: end - start,
                size: chunkBlob.size
              });
            }
            
            const totalSizeMB = (totalChunkSize / 1024 / 1024).toFixed(2);
            const originalSizeMB = (audioFile.size / 1024 / 1024).toFixed(2);
            const sizeIncrease = ((totalChunkSize / audioFile.size - 1) * 100).toFixed(1);
            
            console.log(`✅ Splitting complete!`);
            console.log(`📊 Original: ${originalSizeMB} MB → Chunks: ${totalSizeMB} MB (+${sizeIncrease}%)`);
            console.log(`⚠️ Size increase is due to WAV conversion (uncompressed audio)`);
            
            resolve(chunks);
          } catch (error) {
            console.error('❌ Audio splitting failed:', error);
            reject(error);
          }
        };

        fileReader.onerror = (error) => {
          console.error('❌ File reading failed:', error);
          reject(error);
        };
        fileReader.readAsArrayBuffer(audioFile);
      });
    },

    async audioBufferToBlob(audioBuffer) {
      const numberOfChannels = audioBuffer.numberOfChannels;
      const length = audioBuffer.length;
      const sampleRate = audioBuffer.sampleRate;
      const arrayBuffer = new ArrayBuffer(44 + length * numberOfChannels * 2);
      const view = new DataView(arrayBuffer);
      
      const writeString = (offset, string) => {
        for (let i = 0; i < string.length; i++) {
          view.setUint8(offset + i, string.charCodeAt(i));
        }
      };
      
      writeString(0, 'RIFF');
      view.setUint32(4, 36 + length * numberOfChannels * 2, true);
      writeString(8, 'WAVE');
      writeString(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, numberOfChannels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * numberOfChannels * 2, true);
      view.setUint16(32, numberOfChannels * 2, true);
      view.setUint16(34, 16, true);
      writeString(36, 'data');
      view.setUint32(40, length * numberOfChannels * 2, true);
      
      const channelData = [];
      for (let channel = 0; channel < numberOfChannels; channel++) {
        channelData.push(audioBuffer.getChannelData(channel));
      }
      
      let offset = 44;
      for (let i = 0; i < length; i++) {
        for (let channel = 0; channel < numberOfChannels; channel++) {
          const sample = Math.max(-1, Math.min(1, channelData[channel][i]));
          view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
          offset += 2;
        }
      }
      
      return new Blob([arrayBuffer], { type: 'audio/wav' });
    },

    async transcribeChunk(chunk, chunkIndex) {
        console.log(`🎤 Transcribing chunk ${chunkIndex + 1}...`);
        const formData = new FormData();
        formData.append('file', chunk.blob, `chunk_${chunkIndex}.wav`);
        formData.append('model', 'whisper-1');

        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${this.apiKey}` },
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenAI Transcription API error (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        console.log(`📝 Transcription: "${data.text}"`);
        return data.text;
    },

    async translateChunk(text, chunkIndex) {
        console.log(`🔄 Translating chunk ${chunkIndex + 1}...`);
        const url = `https://translation.googleapis.com/language/translate/v2?key=${this.googleApiKey}&q=${encodeURI(text)}&target=en&source=ar`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Google Translate API error (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        const translatedText = data.data.translations[0].translatedText;
        console.log(`🌐 Translation: "${translatedText}"`);
        return translatedText;
    },

    async processChunk(chunk, chunkIndex, totalChunks) {
      const chunkSizeMB = (chunk.size / 1024 / 1024).toFixed(2);
      console.log(`🎤 Processing chunk ${chunkIndex + 1}/${totalChunks}`);
      console.log(`⏱️ Time: ${chunk.startTime.toFixed(1)}s - ${chunk.endTime.toFixed(1)}s (${chunk.duration.toFixed(1)}s duration)`);
      console.log(`💾 Size: ${chunkSizeMB} MB`);
      
      try {
        if (!this.apiKey || !this.googleApiKey) {
          throw new Error('API key not found. Please check your config.js file.');
        }
        
        this.currentStatus = `Transcribing Arabic audio for chunk ${chunkIndex + 1}...`;
        const arabicText = await this.transcribeChunk(chunk, chunkIndex);
        let englishText = '';
        
        if (arabicText && arabicText.trim()) {
          try {
            this.currentStatus = `Translating chunk ${chunkIndex + 1} to English...`;
            englishText = await this.translateChunk(arabicText, chunkIndex);
            console.log(`🌐 Translation completed for chunk ${chunkIndex + 1}`);
          } catch (error) {
            console.log(`⚠️ Translation failed for chunk ${chunkIndex + 1}: ${error.message}`);
          }
        }
        
        console.log(`✅ Chunk ${chunkIndex + 1} completed successfully`);
        
        return {
          chunkIndex,
          startTime: chunk.startTime,
          endTime: chunk.endTime,
          arabicText,
          englishText,
          success: true
        };
        
      } catch (error) {
        console.error(`❌ Error processing chunk ${chunkIndex + 1}:`, error);
        return {
          chunkIndex,
          startTime: chunk.startTime,
          endTime: chunk.endTime,
          error: error.message,
          success: false
        };
      }
    },

    async processAudio() {
      if (!this.file) return; 
      
      this.processing = true;
      this.status = 'processing';
      this.progress = 0;
      this.currentStatus = 'Initializing process...';
      this.currentChunk = -1;
      
      console.log('🚀 Starting Arabic audio conversion process...');
      console.log(`📁 File: ${this.file.name} (${(this.file.size / 1024 / 1024).toFixed(2)} MB)`);

      try {
        this.progress = 5;
        this.currentStatus = 'Splitting audio into 2-minute chunks...';
        console.log('\n=== STEP 1: AUDIO SPLITTING ===');
        const audioChunks = await this.splitAudioIntoChunks(this._actualFile);
        this.chunks = audioChunks;
        
        let chunksToProcess = audioChunks;
        if (this.chunkLimit > 0 && this.chunkLimit < audioChunks.length) {
          chunksToProcess = audioChunks.slice(0, this.chunkLimit);
          console.log(`⚠️ Processing limited to ${this.chunkLimit} chunks (out of ${audioChunks.length} total)`);
        }
        
        this.progress = 15;
        this.currentStatus = `Processing ${chunksToProcess.length} chunks (transcribe & translate)...`;
        console.log(`\n=== STEP 2: PROCESSING ${chunksToProcess.length} CHUNKS (TRANSCRIBE & TRANSLATE) ===`);
        
        const chunkResults = [];
        const totalChunks = chunksToProcess.length;
        
        for (let i = 0; i < chunksToProcess.length; i++) {
          const chunk = chunksToProcess[i];
          this.currentChunk = i;
          this.currentStatus = `Processing chunk ${i + 1} of ${totalChunks} - Transcribing Arabic audio...`;
          console.log(`\n--- Processing Chunk ${i + 1}/${totalChunks} ---`);
          
          const result = await this.processChunk(chunk, i, totalChunks);
          chunkResults.push(result);
          
          if (!result.success) {
            console.log(`❌ Chunk ${i + 1} failed: ${result.error}`);
            this.currentStatus = `Chunk ${i + 1} failed: ${result.error}`;
          } else {
            this.currentStatus = `Completed chunk ${i + 1} of ${totalChunks}`;
          }
          
          const chunkProgress = 15 + (70 * (i + 1)) / totalChunks;
          this.progress = Math.round(chunkProgress);
          
          if (i < totalChunks - 1) {
            this.currentStatus = 'Waiting 2 seconds (API rate limiting)...';
            console.log('⏳ Waiting 2 seconds (rate limiting for both APIs)...');
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
        
        this.progress = 85;
        this.currentStatus = 'Combining all transcription results...';
        this.currentChunk = -1;
        console.log('\n=== STEP 3: CONCATENATING RESULTS ===');
        this.results = chunkResults;
        
        const successfulResults = chunkResults.filter(r => r.success);
        const failedResults = chunkResults.filter(r => !r.success);
        
        console.log(`📊 Processing summary:`);
        console.log(`✅ Successful: ${successfulResults.length}`);
        console.log(`❌ Failed: ${failedResults.length}`);
        
        const combinedArabic = successfulResults.map(r => r.arabicText).filter(text => text.trim()).join(' ');
        const combinedEnglish = successfulResults.map(r => r.englishText).filter(text => text.trim()).join(' ');
        
        this.finalText = {
          arabic: combinedArabic,
          english: combinedEnglish
        };
        
        this.progress = 100;
        this.status = 'completed';
        this.currentStatus = `✅ Processing complete! Generated ${combinedArabic.length} characters of Arabic text and ${combinedEnglish.length} characters of English translation.`;
        
        console.log('\n🎉 PROCESSING COMPLETE!');
        console.log(`📝 Total Arabic text: ${combinedArabic.length} characters`);
        console.log(`📝 Total English text: ${combinedEnglish.length} characters`);
        
        if (combinedArabic.length > 0) {
          console.log(`\n📖 Preview:`);
          console.log(`Arabic: "${combinedArabic.substring(0, 100)}${combinedArabic.length > 100 ? '...' : ''}"`);
        }
        
        if (combinedEnglish.length > 0) {
          console.log(`English: "${combinedEnglish.substring(0, 100)}${combinedEnglish.length > 100 ? '...' : ''}"`);
        }
        
      } catch (error) {
        console.error('❌ Processing failed:', error);
        this.status = 'error';
        this.currentStatus = `❌ Error: ${error.message}`;
        this.currentChunk = -1;
      } finally {
        this.processing = false;
      }
    },

    async translateAll() {
      if (!this.finalText.arabic) {
        console.log('❌ No Arabic text available for translation');
        return;
      }

      if (this.finalText.english) {
        console.log('✅ Translation already completed!');
        return;
      }

      try {
        console.log('🔄 Translating all text...');
        const englishText = await this.translateChunk(this.finalText.arabic, -1);
        this.finalText.english = englishText;
        console.log('✅ Translation complete!');
      } catch (error) {
        console.error('❌ Error translating all text:', error);
      }
    },

    async generateAudioFromChunkedText(text, language = 'en') {
      if (!text || text.trim() === '') {
        console.log('❌ No text provided for audio generation');
        return null;
      }

      try {
        console.log(`🎵 Generating ${language} audio from text...`);
        console.log(`📝 Text length: ${text.length} characters`);
        
        const chunks = this.chunkTextForTTS(text, 4000);
        
        if (chunks.length === 1) {
          console.log('📝 Single chunk, generating audio directly');
          return await this.textToSpeechBlob(chunks[0]);
        }
        
        console.log(`📝 Processing ${chunks.length} text chunks for audio generation...`);
        const audioBlobs = [];
        
        for (let i = 0; i < chunks.length; i++) {
          console.log(`🎤 Generating audio for chunk ${i + 1}/${chunks.length}...`);
          const audioBlob = await this.textToSpeechBlob(chunks[i]);
          audioBlobs.push(audioBlob);
          
          if (i < chunks.length - 1) {
            console.log('⏳ Waiting 1 second between TTS requests...');
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
        console.log('🔗 Combining audio chunks...');
        const combinedAudio = await this.combineAudioBlobs(audioBlobs);
        
        console.log(`✅ ${language} audio generated successfully! Size: ${(combinedAudio.size / 1024 / 1024).toFixed(2)} MB`);
        
        return combinedAudio;
        
      } catch (error) {
        console.error(`❌ Error generating ${language} audio:`, error);
        return null;
      }
    },

    async generateEnglishAudio() {
      if (!this.finalText.english) {
        console.log('❌ No English text available for audio generation');
        return null;
      }

      return await this.generateAudioFromChunkedText(this.finalText.english, 'English');
    },


    chunkTextForTTS(text, maxChars = 4000) {
      if (text.length <= maxChars) {
        return [text];
      }
      
      const chunks = [];
      const sentences = this.splitIntoSentences(text);
      
      let currentChunk = '';
      
      for (const sentence of sentences) {
        if (sentence.length > maxChars) {
          if (currentChunk) {
            chunks.push(currentChunk.trim());
            currentChunk = '';
          }
          
          const subChunks = this.splitLongSentence(sentence, maxChars);
          chunks.push(...subChunks);
        } else if (currentChunk.length + sentence.length + 1 <= maxChars) {
          currentChunk += (currentChunk ? ' ' : '') + sentence;
        } else {
          if (currentChunk) {
            chunks.push(currentChunk.trim());
          }
          currentChunk = sentence;
        }
      }
      
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      
      console.log(`📝 Text chunked: ${text.length} chars → ${chunks.length} chunks`);
      chunks.forEach((chunk, i) => {
        console.log(`   Chunk ${i + 1}: ${chunk.length} chars`);
      });
      
      return chunks.filter(chunk => chunk.length > 0);
    },

    splitIntoSentences(text) {
      const arabicSentenceEnders = /[.!?؟۔]/g;
      const englishSentenceEnders = /[.!?]/g;
      
      const hasArabic = /[\u0600-\u06FF]/.test(text);
      const sentenceEnders = hasArabic ? arabicSentenceEnders : englishSentenceEnders;
      
      return text.split(sentenceEnders)
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .map((s, i, arr) => {
          if (i < arr.length - 1 || !text.match(sentenceEnders)) {
            const match = text.match(sentenceEnders);
            if (match && match[i]) {
              return s + match[i];
            }
          }
          return s;
        })
        .filter(s => s.length > 0);
    },

    splitLongSentence(sentence, maxChars) {
      if (sentence.length <= maxChars) {
        return [sentence];
      }
      
      const chunks = [];
      const words = sentence.split(/\s+/);
      let currentChunk = '';
      
      for (const word of words) {
        if (word.length > maxChars) {
          if (currentChunk) {
            chunks.push(currentChunk.trim());
            currentChunk = '';
          }
          
          for (let i = 0; i < word.length; i += maxChars) {
            chunks.push(word.substring(i, i + maxChars));
          }
        } else if (currentChunk.length + word.length + 1 <= maxChars) {
          currentChunk += (currentChunk ? ' ' : '') + word;
        } else {
          if (currentChunk) {
            chunks.push(currentChunk.trim());
          }
          currentChunk = word;
        }
      }
      
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      
      return chunks.filter(chunk => chunk.length > 0);
    },

    async textToSpeechBlob(text) {
      try {
        console.log(`🎤 Converting text to speech using OpenAI TTS: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
        
        if (!this.apiKey) {
          throw new Error('OpenAI API key not found. Please check your config.js file.');
        }
        
        const response = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'tts-1-hd',
            input: text,
            voice: 'onyx',
            response_format: 'mp3',
            speed: 1.0
          })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`OpenAI TTS API error (${response.status}): ${errorText}`);
        }
        
        const audioBlob = await response.blob();
        console.log(`✅ TTS successful, audio size: ${(audioBlob.size / 1024).toFixed(2)} KB`);
        
        return audioBlob;
        
      } catch (error) {
        console.error('❌ OpenAI TTS error:', error);
        throw error;
      }
    },

    async combineAudioBlobs(audioBlobs) {
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        const audioContext = new AudioContextClass();
        const audioBuffers = [];
        
        for (const blob of audioBlobs) {
          const arrayBuffer = await blob.arrayBuffer();
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          audioBuffers.push(audioBuffer);
        }
        
        const totalLength = audioBuffers.reduce((sum, buffer) => sum + buffer.length, 0);
        const sampleRate = audioBuffers[0]?.sampleRate || 44100;
        const numberOfChannels = audioBuffers[0]?.numberOfChannels || 2;
        
        const combinedBuffer = audioContext.createBuffer(numberOfChannels, totalLength, sampleRate);
        
        let offset = 0;
        for (const buffer of audioBuffers) {
          for (let channel = 0; channel < numberOfChannels; channel++) {
            const channelData = buffer.getChannelData(channel);
            const combinedChannelData = combinedBuffer.getChannelData(channel);
            
            for (let i = 0; i < channelData.length; i++) {
              if (offset + i < combinedChannelData.length) {
                combinedChannelData[offset + i] = channelData[i];
              }
            }
          }
          offset += buffer.length;
        }
        
        return await this.audioBufferToBlob(combinedBuffer);
        
      } catch (error) {
        console.error('❌ Error combining audio blobs:', error);
        throw error;
      }
    },

    async downloadAudio(text, filename, language) {
      try {
        console.log(`🎵 Generating ${language} audio for download...`);
        const audioBlob = await this.generateAudioFromChunkedText(text, language);
        
        if (audioBlob) {
          const url = URL.createObjectURL(audioBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          
          console.log(`✅ ${language} audio download started!`);
        } else {
          console.log(`❌ Failed to generate ${language} audio`);
        }
      } catch (error) {
        console.error(`❌ Error downloading ${language} audio:`, error);
      }
    },

    async downloadEnglishAudio() {
      await this.translateAll();
      await this.downloadAudio(this.finalText.english, 'english_translation_audio.mp3', 'English');
    },


    downloadArabicText() {
      if (!this.finalText.arabic) {
        console.log('❌ No Arabic text available for download');
        return;
      }
      
      const blob = new Blob([this.finalText.arabic], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'arabic_transcription.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      console.log('✅ Arabic text download started!');
    },

    downloadEnglishText() {
      if (!this.finalText.english) {
        console.log('❌ No English text available for download');
        return;
      }
      
      const blob = new Blob([this.finalText.english], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'english_translation.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      console.log('✅ English text download started!');
    },

    async generateAudioFromText(text, filename = 'generated_audio.mp3') {
      if (!text || text.trim() === '') {
        console.log('❌ No text provided for audio generation');
        return null;
      }

      try {
        console.log(`🎵 Generating audio directly from text (${text.length} characters)...`);
        const audioBlob = await this.textToSpeechBlob(text);
        
        if (audioBlob) {
          console.log(`✅ Audio generated successfully! Size: ${(audioBlob.size / 1024).toFixed(2)} KB`);
          
          const url = URL.createObjectURL(audioBlob);
          const downloadLink = document.createElement('a');
          downloadLink.href = url;
          downloadLink.download = filename;
          downloadLink.click();
          URL.revokeObjectURL(url);
          
          console.log(`📥 Audio download started: ${filename}`);
          return audioBlob;
        } else {
          console.log('❌ Failed to generate audio');
          return null;
        }
      } catch (error) {
        console.error('❌ Error generating audio from text:', error);
        return null;
      }
    },

    setFinalText(arabicText = '', englishText = '') {
      this.finalText = {
        arabic: arabicText,
        english: englishText
      };
      console.log(`📝 Final text updated - Arabic: ${arabicText.length} chars, English: ${englishText.length} chars`);
    },

    downloadResults() {
      const content = `Arabic Transcript:
${this.finalText.arabic}

English Translation:
${this.finalText.english}

--- Chunk Details ---

${this.results.map(r => 
        `Chunk ${r.chunkIndex + 1} (${r.startTime.toFixed(1)}s - ${r.endTime.toFixed(1)}s):
Arabic: ${r.arabicText || 'Error: ' + r.error}
English: ${r.englishText || 'Translation failed/unavailable'}

`
      ).join('')}`;
      
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'arabic_audio_transcript.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },

    formatTime(seconds) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    },

    getChunkResult(index) {
      return this.results.find(r => r.chunkIndex === index);
    }
  };

  for (const key in converter) {
    if (typeof converter[key] === 'function') {
      converter[key] = converter[key].bind(converter);
    }
  }

  return converter;
}