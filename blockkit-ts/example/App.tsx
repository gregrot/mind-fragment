/**
 * Simple example application demonstrating the StackEditor
 * 
 * This example shows:
 * - Block palette with drag-and-drop functionality
 * - Program execution with nested C-blocks
 * - Different block types (hat, statement, c-blocks)
 * - Program serialization and state management
 */

import React, { useState } from 'react';
import { StackEditor } from '../src/StackEditor';
import { createDefaultRegistry } from '../src/StackRegistry';
import { StackProgram } from '../src/types';
import { StackInterpreter } from '../src/StackInterpreter';
import { serializeProgram, deserializeProgram, getProgramStats } from '../src/StackSerializer';

function App() {
  const [program, setProgram] = useState<StackProgram>({ blocks: [] });
  const [savedPrograms, setSavedPrograms] = useState<string[]>([]);
  const [executionLog, setExecutionLog] = useState<string[]>([]);
  
  // Create registry with default blocks
  const registry = createDefaultRegistry();

  const handleProgramChange = (newProgram: StackProgram) => {
    setProgram(newProgram);
    console.log('Program updated:', newProgram);
  };

  const handleExecute = async (program: StackProgram) => {
    console.log('Executing program:', program);
    setExecutionLog([]); // Clear previous execution log
    
    // Capture console.log output during execution
    const originalLog = console.log;
    const logMessages: string[] = [];
    
    console.log = (...args: any[]) => {
      const message = args.join(' ');
      logMessages.push(message);
      originalLog(...args); // Still log to actual console
    };
    
    const interpreter = new StackInterpreter();
    try {
      await interpreter.run(program);
      setExecutionLog(logMessages);
      console.log = originalLog; // Restore original console.log
      console.log('Program execution completed');
    } catch (error) {
      console.log = originalLog; // Restore original console.log
      console.error('Program execution failed:', error);
      setExecutionLog([...logMessages, `Error: ${error.message}`]);
    }
  };

  const handleSave = (serializedProgram: string) => {
    // In a real app, this would save to localStorage, server, etc.
    setSavedPrograms(prev => [...prev, serializedProgram]);
    console.log('Program saved:', serializedProgram);
    alert('Program saved successfully!');
  };

  const handleLoad = () => {
    if (savedPrograms.length === 0) {
      alert('No saved programs available');
      return;
    }
    
    // For demo purposes, load the most recent saved program
    const latestSaved = savedPrograms[savedPrograms.length - 1];
    try {
      const loadedProgram = deserializeProgram(latestSaved);
      setProgram(loadedProgram);
      console.log('Program loaded:', loadedProgram);
      alert('Program loaded successfully!');
    } catch (error) {
      console.error('Failed to load program:', error);
      alert('Failed to load program: ' + error.message);
    }
  };

  // Create a sample program with nested C-blocks to demonstrate functionality
  const createSampleProgram = () => {
    const sampleProgram: StackProgram = {
      blocks: [
        {
          id: 'start_1',
          kind: 'event.start',
          form: 'hat'
        },
        {
          id: 'say_1',
          kind: 'looks.say',
          form: 'statement',
          inputs: {
            TEXT: { literal: 'Hello, World!' }
          }
        },
        {
          id: 'repeat_1',
          kind: 'control.repeat',
          form: 'c',
          inputs: {
            TIMES: { literal: 3 }
          },
          slots: {
            DO: [
              {
                id: 'say_2',
                kind: 'looks.say',
                form: 'statement',
                inputs: {
                  TEXT: { literal: 'Counting...' }
                }
              },
              {
                id: 'if_1',
                kind: 'control.if',
                form: 'c',
                inputs: {
                  CONDITION: { literal: true }
                },
                slots: {
                  THEN: [
                    {
                      id: 'think_1',
                      kind: 'looks.think',
                      form: 'statement',
                      inputs: {
                        TEXT: { literal: 'Nested thinking!' }
                      }
                    },
                    {
                      id: 'wait_1',
                      kind: 'control.wait',
                      form: 'statement',
                      inputs: {
                        DURATION: { literal: 0.5 }
                      }
                    }
                  ]
                }
              }
            ]
          }
        },
        {
          id: 'say_3',
          kind: 'looks.say',
          form: 'statement',
          inputs: {
            TEXT: { literal: 'Done!' }
          }
        }
      ]
    };
    setProgram(sampleProgram);
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>Stack Blocks Example</h1>
      <p>
        This example demonstrates a simplified visual programming library with Scratch-style stack blocks.
        <br />
        <strong>Try these features:</strong>
      </p>
      <ul style={{ marginBottom: '20px' }}>
        <li><strong>Drag blocks</strong> from the palette to create a program</li>
        <li><strong>Move existing blocks</strong> by dragging them to different positions</li>
        <li><strong>Nest blocks</strong> inside C-shaped blocks (repeat, if/then)</li>
        <li><strong>Execute programs</strong> to see the output in the execution log</li>
        <li><strong>Save and load</strong> programs using serialization</li>
      </ul>
      
      <div style={{ marginBottom: '10px' }}>
        <button 
          onClick={createSampleProgram}
          style={{
            backgroundColor: '#9C27B0',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            marginRight: '10px'
          }}
        >
          Load Sample Program
        </button>
        <button 
          onClick={() => setProgram({ blocks: [] })}
          style={{
            backgroundColor: '#F44336',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          Clear Program
        </button>
      </div>
      
      <StackEditor
        registry={registry}
        program={program}
        onChange={handleProgramChange}
        onExecute={handleExecute}
        onSave={handleSave}
        onLoad={handleLoad}
      />
      
      <div style={{ marginTop: '20px', display: 'flex', gap: '20px' }}>
        <div style={{ flex: 1 }}>
          <h3>Execution Log</h3>
          <div style={{ 
            backgroundColor: '#f5f5f5', 
            padding: '10px', 
            borderRadius: '4px',
            fontSize: '12px',
            minHeight: '100px',
            maxHeight: '200px',
            overflow: 'auto',
            border: '1px solid #ddd'
          }}>
            {executionLog.length > 0 ? (
              executionLog.map((log, index) => (
                <div key={index} style={{ marginBottom: '2px' }}>
                  {log}
                </div>
              ))
            ) : (
              <div style={{ color: '#666', fontStyle: 'italic' }}>
                Click "Run" to execute the program and see output here
              </div>
            )}
          </div>
          
          <div style={{ marginTop: '10px' }}>
            <h4>Program Statistics:</h4>
            {program.blocks.length > 0 ? (
              <div style={{ fontSize: '12px' }}>
                {(() => {
                  const stats = getProgramStats(program);
                  return (
                    <ul style={{ margin: 0, paddingLeft: '20px' }}>
                      <li>Total blocks: {stats.totalBlocks}</li>
                      <li>Max nesting depth: {stats.maxNestingDepth}</li>
                      <li>Blocks by type: {JSON.stringify(stats.blocksByForm)}</li>
                    </ul>
                  );
                })()}
              </div>
            ) : (
              <div style={{ fontSize: '12px', fontStyle: 'italic' }}>
                Add some blocks to see statistics
              </div>
            )}
          </div>
        </div>
        
        <div style={{ flex: 1 }}>
          <h3>Program Structure (JSON)</h3>
          <pre style={{ 
            backgroundColor: '#f0f8ff', 
            padding: '10px', 
            borderRadius: '4px',
            fontSize: '11px',
            overflow: 'auto',
            maxHeight: '300px',
            border: '1px solid #ddd'
          }}>
            {program.blocks.length > 0 ? JSON.stringify(program, null, 2) : 'No blocks in program'}
          </pre>
          
          <div style={{ marginTop: '10px' }}>
            <h4>Serialized Program</h4>
            <div style={{ 
              backgroundColor: '#fff3e0', 
              padding: '8px', 
              borderRadius: '4px',
              fontSize: '11px',
              maxHeight: '100px',
              overflow: 'auto',
              border: '1px solid #ddd',
              wordBreak: 'break-all'
            }}>
              {program.blocks.length > 0 ? serializeProgram(program) : 'No blocks to serialize'}
            </div>
            
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
              Saved Programs: {savedPrograms.length}
              <br />
              Use Save/Load buttons to test serialization
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;