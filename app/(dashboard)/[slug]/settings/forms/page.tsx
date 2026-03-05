'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Copy, 
  Loader2, 
  FileText, 
  Settings2,
  X
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent,
  CardDescription,
  CardFooter
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FormField {
  id: string;
  type: string;
  label: string;
  required: boolean;
  options?: string[];
  helpText?: string;
}

interface FormTemplate {
  id: string;
  name: string;
  description?: string;
  fields: FormField[];
  requires_signature: boolean;
  gdpr_consent_text?: string;
  is_active: boolean;
}

const FIELD_TYPES = [
  { value: 'text', label: 'Tekst' },
  { value: 'textarea', label: 'Długi tekst' },
  { value: 'checkbox', label: 'Checkboxes' },
  { value: 'radio', label: 'Radio' },
  { value: 'select', label: 'Lista' },
  { value: 'date', label: 'Data' },
  { value: 'signature', label: 'Podpis' },
  { value: 'section_header', label: 'Nagłówek sekcji' },
];

export default function FormTemplatesPage() {
  const params = useParams();
  const slug = params?.slug as string;

  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Partial<FormTemplate> | null>(null);

  useEffect(() => {
    fetchTemplates();
  }, [slug]);

  const fetchTemplates = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/forms/templates');
      if (!response.ok) throw new Error('Błąd podczas pobierania szablonów');
      const data = await response.json();
      setTemplates((data.templates || []).filter((t: FormTemplate) => t.is_active));
    } catch (error) {
      toast.error('Nie udało się załadować szablonów formularzy');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNew = () => {
    setEditingTemplate({
      name: '',
      description: '',
      fields: [],
      requires_signature: false,
      gdpr_consent_text: '',
      is_active: true
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (template: FormTemplate) => {
    setEditingTemplate({ ...template });
    setIsDialogOpen(true);
  };

  const handleDuplicate = async (template: FormTemplate) => {
    try {
      const { id, ...templateData } = template;
      const duplicatedData = {
        ...templateData,
        name: `${template.name} (kopia)`,
      };

      const response = await fetch('/api/forms/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(duplicatedData),
      });

      if (!response.ok) throw new Error('Błąd podczas duplikowania');
      
      toast.success('Szablon został zduplikowany');
      fetchTemplates();
    } catch (error) {
      toast.error('Nie udało się zduplikować szablonu');
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      const response = await fetch(`/api/forms/templates/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Błąd podczas dezaktywacji');

      toast.success('Szablon został dezaktywowany');
      fetchTemplates();
    } catch (error) {
      toast.error('Nie udało się dezaktywować szablonu');
    }
  };

  const handleSave = async () => {
    if (!editingTemplate?.name) {
      toast.error('Nazwa formularza jest wymagana');
      return;
    }

    try {
      setIsSubmitting(true);
      const method = editingTemplate.id ? 'PUT' : 'POST';
      const url = editingTemplate.id 
        ? `/api/forms/templates/${editingTemplate.id}` 
        : '/api/forms/templates';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingTemplate),
      });

      if (!response.ok) throw new Error('Błąd podczas zapisywania');

      toast.success(editingTemplate.id ? 'Szablon zaktualizowany' : 'Szablon utworzony');
      setIsDialogOpen(false);
      fetchTemplates();
    } catch (error) {
      toast.error('Nie udało się zapisać szablonu');
    } finally {
      setIsSubmitting(false);
    }
  };

  const addField = () => {
    const newField: FormField = {
      id: crypto.randomUUID(),
      type: 'text',
      label: '',
      required: false,
    };
    
    setEditingTemplate(prev => ({
      ...prev!,
      fields: [...(prev?.fields || []), newField]
    }));
  };

  const removeField = (id: string) => {
    setEditingTemplate(prev => ({
      ...prev!,
      fields: prev?.fields?.filter(f => f.id !== id) || []
    }));
  };

  const updateField = (id: string, updates: Partial<FormField>) => {
    setEditingTemplate(prev => ({
      ...prev!,
      fields: prev?.fields?.map(f => f.id === id ? { ...f, ...updates } : f) || []
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Szablony formularzy</h1>
          <p className="text-muted-foreground">Zarządzaj szablonami formularzy dla swoich klientów.</p>
        </div>
        <Button onClick={handleCreateNew}>
          <Plus className="mr-2 h-4 w-4" /> Nowy formularz
        </Button>
      </div>

      {isLoading ? (
        <div className="flex h-[400px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-xl">{template.name}</CardTitle>
                    <CardDescription className="line-clamp-2">
                      {template.description || 'Brak opisu'}
                    </CardDescription>
                  </div>
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent className="flex-grow">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    Liczba pól: {template.fields.length}
                  </Badge>
                  {template.requires_signature && (
                    <Badge variant="outline" className="border-green-500 text-green-600 bg-green-50">
                      Wymaga podpisu
                    </Badge>
                  )}
                </div>
              </CardContent>
              <CardFooter className="grid grid-cols-3 gap-2 border-t pt-4">
                <Button variant="ghost" size="sm" onClick={() => handleEdit(template)}>
                  <Edit2 className="mr-2 h-3.5 w-3.5" /> Edytuj
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDuplicate(template)}>
                  <Copy className="mr-2 h-3.5 w-3.5" /> Duplikuj
                </Button>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDeactivate(template.id)}>
                  <Trash2 className="mr-2 h-3.5 w-3.5" /> Dezaktywuj
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {templates.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <FileText className="h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-semibold">Brak szablonów</h3>
          <p className="mb-6 text-sm text-muted-foreground">Nie masz jeszcze żadnych szablonów formularzy.</p>
          <Button onClick={handleCreateNew}>Utwórz pierwszy szablon</Button>
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle>
              {editingTemplate?.id ? 'Edytuj szablon' : 'Nowy szablon formularza'}
            </DialogTitle>
            <DialogDescription>
              Skonfiguruj pola i ustawienia dla tego formularza.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-grow px-6">
            <div className="space-y-6 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Nazwa formularza</Label>
                  <Input 
                    id="name" 
                    value={editingTemplate?.name || ''} 
                    onChange={e => setEditingTemplate(prev => ({ ...prev!, name: e.target.value }))}
                    placeholder="np. Karta klienta, Zgoda na zabieg"
                  />
                </div>
                <div className="flex items-center space-x-2 pt-8">
                  <Checkbox 
                    id="requires_signature" 
                    checked={editingTemplate?.requires_signature || false}
                    onCheckedChange={checked => setEditingTemplate(prev => ({ ...prev!, requires_signature: checked as boolean }))}
                  />
                  <Label htmlFor="requires_signature" className="cursor-pointer">Wymaga podpisu</Label>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Opis</Label>
                <Textarea 
                  id="description" 
                  value={editingTemplate?.description || ''} 
                  onChange={e => setEditingTemplate(prev => ({ ...prev!, description: e.target.value }))}
                  placeholder="Krótki opis przeznaczenia formularza"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="gdpr">Treść zgody RODO</Label>
                <Textarea 
                  id="gdpr" 
                  value={editingTemplate?.gdpr_consent_text || ''} 
                  onChange={e => setEditingTemplate(prev => ({ ...prev!, gdpr_consent_text: e.target.value }))}
                  placeholder="Treść klauzuli informacyjnej..."
                  className="min-h-[100px]"
                />
              </div>

              <hr className="my-4 border-t" />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">Pola formularza</h3>
                  <Button type="button" variant="outline" size="sm" onClick={addField}>
                    <Plus className="mr-2 h-4 w-4" /> Dodaj pole
                  </Button>
                </div>

                <div className="space-y-4">
                  {editingTemplate?.fields?.map((field, index) => (
                    <div key={field.id} className="relative rounded-lg border bg-card p-4 shadow-sm">
                      <div className="mb-4 flex items-start justify-between">
                        <Badge variant="outline" className="mb-2">Pole #{index + 1}</Badge>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-destructive"
                          onClick={() => removeField(field.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="space-y-2 lg:col-span-2">
                          <Label>Etykieta</Label>
                          <Input 
                            value={field.label} 
                            onChange={e => updateField(field.id, { label: e.target.value })}
                            placeholder="np. Imię i nazwisko"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Typ pola</Label>
                          <Select 
                            value={field.type} 
                            onValueChange={value => updateField(field.id, { type: value })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Wybierz typ" />
                            </SelectTrigger>
                            <SelectContent>
                              {FIELD_TYPES.map(type => (
                                <SelectItem key={type.value} value={type.value}>
                                  {type.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center space-x-2 pt-8">
                          <Checkbox 
                            id={`req-${field.id}`}
                            checked={field.required}
                            onCheckedChange={checked => updateField(field.id, { required: checked as boolean })}
                          />
                          <Label htmlFor={`req-${field.id}`} className="cursor-pointer text-sm">Wymagane</Label>
                        </div>
                      </div>

                      {['checkbox', 'radio', 'select'].includes(field.type) && (
                        <div className="mt-4 space-y-2">
                          <Label>Opcje (oddzielone przecinkami)</Label>
                          <Input 
                            value={field.options?.join(', ') || ''} 
                            onChange={e => updateField(field.id, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                            placeholder="Opcja 1, Opcja 2, Opcja 3"
                          />
                        </div>
                      )}
                    </div>
                  ))}

                  {(!editingTemplate?.fields || editingTemplate.fields.length === 0) && (
                    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-8 text-center text-muted-foreground">
                      <Settings2 className="mb-2 h-8 w-8 opacity-20" />
                      <p className="text-sm">Brak zdefiniowanych pól. Kliknij "Dodaj pole", aby rozpocząć.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t p-6">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>
              Anuluj
            </Button>
            <Button onClick={handleSave} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingTemplate?.id ? 'Zapisz zmiany' : 'Utwórz szablon'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

