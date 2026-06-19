export const fileTreeData = [
  {
    id: '1',
    name: 'Документы',
    type: 'folder',
    children: [
      {
        id: '1-1',
        name: 'Рабочие материалы',
        type: 'folder',
        children: [
          {
            id: '1-1-1',
            name: 'Проект 2024',
            type: 'folder',
            children: [
              { id: '1-1-1-1', name: 'Отчет.docx', type: 'file', size: '2.4 МБ' },
              { id: '1-1-1-2', name: 'Финансы.xlsx', type: 'file', size: '1.8 МБ' },
              { id: '1-1-1-3', name: 'Презентация.pptx', type: 'file', size: '5.2 МБ' }
            ]
          }
        ]
      }
    ]
  }
]
