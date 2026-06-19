import React, { useState } from 'react'
import { Folder, File } from 'lucide-react'
import { fileTreeData } from '../data/mockData'

export const FileExplorer = () => {
  const [expandedFolders, setExpandedFolders] = useState(['1'])
  const [selectedFolder, setSelectedFolder] = useState('1')
  const [files, setFiles] = useState(fileTreeData)

  const toggleFolder = (folderId) => {
    if (expandedFolders.includes(folderId)) {
      setExpandedFolders(expandedFolders.filter(id => id !== folderId))
    } else {
      setExpandedFolders([...expandedFolders, folderId])
    }
  }

  const handleFileSelect = (folderId, folder) => {
    setSelectedFolder(folderId)
    if (folder.children) {
      setFiles(folder.children)
    }
  }

  const getFileIcon = (type) => {
    switch (type) {
      case 'folder': return <Folder className="text-yellow-400" size={40} />
      case 'file': return <File className="text-gray-400" size={40} />
      default: return <File className="text-gray-400" size={40} />
    }
  }

  const renderTree = (nodes, level = 0) => {
    return nodes.map((node) => (
      <div key={node.id}>
        <div
          className="flex items-center gap-2 py-1.5 px-2 hover:bg-bg-hover cursor-pointer rounded-md group"
          style={{ paddingLeft: `${level * 16 + 12}px` }}
          onClick={() => handleFileSelect(node.id, node)}
        >
          {node.children && (
            <span className="text-gray-500 text-sm">▶</span>
          )}
          {getFileIcon(node.type)}
          <span className="text-sm">{node.name}</span>
        </div>
        {node.children && expandedFolders.includes(node.id) && node.children.length > 0 && (
          <div>{renderTree(node.children, level + 1)}</div>
        )}
      </div>
    ))
  }

  const renderFilesGrid = () => {
    return files.map((file) => (
      <div key={file.id} className="bg-bg-card hover:bg-bg-hover rounded-lg p-4 cursor-pointer transition-all border border-transparent hover:border-gray-700">
        <div className="flex justify-center mb-3">{getFileIcon(file.type)}</div>
        <div className="text-sm font-medium text-center truncate" title={file.name}>{file.name}</div>
        <div className="text-xs text-gray-500 text-center mt-1">{file.size || 'Unknown size'}</div>
      </div>
    ))
  }

  return (
    <div className="flex h-full bg-bg-sidebar border-r border-gray-800">
      <div className="w-64 bg-bg-sidebar flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Файловая система</h2>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {renderTree(fileTreeData)}
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-bg-main">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-lg font-semibold text-white">{selectedFolder === '1' ? 'Документы' : 'Файловая система'}</h1>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
          {files.length > 0 ? (
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-4">
              {renderFilesGrid()}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <File size={48} className="mx-auto mb-2 opacity-50" />
                <p>Папка пуста</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
